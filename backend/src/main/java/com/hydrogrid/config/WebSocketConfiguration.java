package com.hydrogrid.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.security.Principal;

@Configuration
@EnableWebSocketMessageBroker
class WebSocketConfiguration implements WebSocketMessageBrokerConfigurer {
    static final String UPDATE_TOPIC = "/topic/updates/";
    private final JwtDecoder tokens;

    WebSocketConfiguration(JwtDecoder tokens) {
        this.tokens = tokens;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor headers = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (headers == null) return message;

                if (headers.getCommand() == StompCommand.CONNECT || headers.getCommand() == StompCommand.STOMP) {
                    String auth = headers.getFirstNativeHeader("Authorization");
                    if (auth == null || !auth.startsWith("Bearer ")) {
                        throw new AccessDeniedException("A demo token is required");
                    }
                    try {
                        String id = tokens.decode(auth.substring(7)).getClaimAsString("session");
                        if (id == null) throw new AccessDeniedException("Demo session is missing");
                        headers.setUser(() -> id);
                    } catch (JwtException error) {
                        throw new AccessDeniedException("Invalid demo token");
                    }
                } else if (headers.getCommand() == StompCommand.SUBSCRIBE) {
                    Principal session = headers.getUser();
                    if (session == null || !(UPDATE_TOPIC + session.getName()).equals(headers.getDestination())) {
                        throw new AccessDeniedException("Subscription is outside this demo session");
                    }
                } else if (headers.getCommand() == StompCommand.SEND) {
                    throw new AccessDeniedException("Use the role-protected HTTP API for updates");
                }
                return message;
            }
        });
    }
}
