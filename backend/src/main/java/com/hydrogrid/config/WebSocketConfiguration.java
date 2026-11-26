package com.hydrogrid.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
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
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
@EnableWebSocketMessageBroker
class WebSocketConfiguration implements WebSocketMessageBrokerConfigurer {
    static final String UPDATE_TOPIC = "/topic/updates/";
    private final JwtDecoder tokens;
    private final ConcurrentHashMap<String, Instant> leases = new ConcurrentHashMap<>();

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
                        var jwt = tokens.decode(auth.substring(7));
                        String id = jwt.getClaimAsString("session");
                        String socket = headers.getSessionId();
                        if (socket == null || id == null || jwt.getExpiresAt() == null ||
                                !Boolean.TRUE.equals(jwt.getClaimAsBoolean("demoOwned"))) {
                            throw new AccessDeniedException("An owned exercise workspace is required");
                        }
                        leases.put(socket, jwt.getExpiresAt());
                        headers.setUser(new DemoSubscriber(id, jwt.getExpiresAt()));
                    } catch (JwtException error) {
                        throw new AccessDeniedException("Invalid demo token");
                    }
                } else if (headers.getCommand() == StompCommand.SUBSCRIBE) {
                    if (!(headers.getUser() instanceof DemoSubscriber subscriber) ||
                            !subscriber.expiresAt().isAfter(Instant.now()) ||
                            !(UPDATE_TOPIC + subscriber.getName()).equals(headers.getDestination())) {
                        throw new AccessDeniedException("Subscription is outside this demo session");
                    }
                } else if (headers.getCommand() == StompCommand.SEND) {
                    throw new AccessDeniedException("Use the role-protected HTTP API for updates");
                }
                return message;
            }
        });
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                if (SimpMessageHeaderAccessor.getMessageType(message.getHeaders()) != SimpMessageType.MESSAGE) return message;
                String socket = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
                Instant expiresAt = socket == null ? null : leases.get(socket);
                if (expiresAt == null || !expiresAt.isAfter(Instant.now())) return null;
                return message;
            }
        });
    }

    @EventListener
    void disconnected(SessionDisconnectEvent event) {
        leases.remove(event.getSessionId());
    }

    private record DemoSubscriber(String name, Instant expiresAt) implements Principal {
        @Override public String getName() { return name; }
    }
}
