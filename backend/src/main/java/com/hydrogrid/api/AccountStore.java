package com.hydrogrid.api;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
class AccountStore {
    private static final String PROFILE = "a.id, a.display_name, a.email, a.time_zone, a.created_at, 'CITIZEN' AS role";

    private final JdbcClient database;

    AccountStore(JdbcClient database) {
        this.database = database;
    }

    @Transactional
    public Optional<Session> register(String email, String displayName, String passwordHash, byte[] digest) {
        return database.sql("""
                INSERT INTO citizen_accounts (email, display_name, password_hash)
                VALUES (:email, :name, :password)
                ON CONFLICT (email) DO NOTHING
                RETURNING id
                """).param("email", email).param("name", displayName).param("password", passwordHash)
                .query(UUID.class).optional().map(account -> createSession(account, digest));
    }

    Optional<Credential> credential(String email) {
        return database.sql("SELECT id, password_hash FROM citizen_accounts WHERE email = :email")
                .param("email", email).query(Credential.class).optional();
    }

    Session createSession(UUID account, byte[] digest) {
        return database.sql("""
                INSERT INTO citizen_account_sessions (account_id, refresh_digest, expires_at)
                VALUES (:account, :digest, now() + INTERVAL '14 days')
                RETURNING id, account_id, expires_at
                """).param("account", account).param("digest", digest).query(Session.class).single();
    }

    Optional<Session> rotate(byte[] previous, byte[] next) {
        return database.sql("""
                UPDATE citizen_account_sessions SET refresh_digest = :next
                WHERE refresh_digest = :previous AND expires_at > now()
                RETURNING id, account_id, expires_at
                """).param("previous", previous).param("next", next).query(Session.class).optional();
    }

    void revoke(byte[] digest) {
        database.sql("DELETE FROM citizen_account_sessions WHERE refresh_digest = :digest")
                .param("digest", digest).update();
    }

    Optional<Profile> profile(UUID account, UUID session) {
        return database.sql("""
                SELECT %s FROM citizen_accounts a
                JOIN citizen_account_sessions s ON a.id = s.account_id
                WHERE a.id = :account AND s.id = :session AND s.expires_at > now()
                """.formatted(PROFILE)).param("account", account).param("session", session)
                .query(Profile.class).optional();
    }

    Optional<Profile> update(UUID account, UUID session, String displayName, String timeZone) {
        return database.sql("""
                UPDATE citizen_accounts a SET display_name = :name, time_zone = :zone
                FROM citizen_account_sessions s
                WHERE a.id = :account AND a.id = s.account_id AND s.id = :session AND s.expires_at > now()
                RETURNING %s
                """.formatted(PROFILE)).param("account", account).param("session", session)
                .param("name", displayName).param("zone", timeZone).query(Profile.class).optional();
    }

    @Scheduled(fixedDelayString = "PT24H", initialDelayString = "PT10M")
    void removeExpiredSessions() {
        database.sql("DELETE FROM citizen_account_sessions WHERE expires_at <= now()").update();
    }

    record Credential(UUID id, String passwordHash) {}
    record Session(UUID id, UUID accountId, OffsetDateTime expiresAt) {}
    record Profile(UUID id, String displayName, String email, String timeZone, OffsetDateTime createdAt, String role) {}
}
