package com.hydrogrid.config;

import com.hydrogrid.api.Models.Update;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

@Component
public class LiveUpdates {
    private final ApplicationEventPublisher events;
    private final SimpMessagingTemplate messaging;

    public LiveUpdates(ApplicationEventPublisher events, SimpMessagingTemplate messaging) {
        this.events = events;
        this.messaging = messaging;
    }

    public void publish(UUID session, String type, UUID entityId) {
        events.publishEvent(new CommittedUpdate(session, new Update(type, entityId)));
    }

    @TransactionalEventListener
    public void onCommit(CommittedUpdate event) {
        messaging.convertAndSend(WebSocketConfiguration.UPDATE_TOPIC + event.session(), event.update());
    }

    record CommittedUpdate(UUID session, Update update) {}
}
