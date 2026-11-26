package com.hydrogrid.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static com.hydrogrid.api.OpsAuthorizer.OPERATOR_PATTERN;
import static com.hydrogrid.api.OpsAuthorizer.Scope;
import static com.hydrogrid.api.OpsStore.Handoff;
import static com.hydrogrid.api.OpsStore.HandoffState;
import static com.hydrogrid.api.OpsStore.Kind;
import static com.hydrogrid.api.OpsStore.Observation;
import static com.hydrogrid.api.OpsStore.SiteState;

@RestController
@RequestMapping("/api/ops")
class OpsController {
    private final OpsAuthorizer authorizer;
    private final OpsStore store;

    OpsController(OpsAuthorizer authorizer, OpsStore store) {
        this.authorizer = authorizer;
        this.store = store;
    }

    @GetMapping("/status")
    Status status() {
        return new Status(authorizer.available());
    }

    @PostMapping("/access")
    AccessToken access(@Valid @RequestBody AccessRequest request) {
        return new AccessToken(authorizer.authenticate(request.operator(), request.code()));
    }

    @GetMapping("/board")
    Board board(@AuthenticationPrincipal Jwt jwt) {
        var operator = authorizer.authenticate(jwt);
        return new Board(operator.name(), operator.scope(),
                operator.scope() == Scope.TRAFFIC_VIEWER ? List.of() : store.observations(),
                operator.canWrite(Scope.DISPATCH) ? store.handoffs() : List.of());
    }

    @PostMapping("/observations")
    Observation observe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ObservationRequest request) {
        var operator = authorizer.authenticate(jwt);
        if (!operator.canWrite(request.kind().scope)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);

        if (!(request.lat() >= 12.65 && request.lat() <= 13.40 && request.lng() >= 77.25 && request.lng() <= 78.00)) {
            throw badRequest("Observation coordinates must be in the Bengaluru operating area");
        }
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var observedAt = request.observedAt().withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
        if (observedAt.isBefore(now.minusHours(24)) || observedAt.isAfter(now.plusMinutes(2))) {
            throw badRequest("Observation time must be within the last 24 hours");
        }

        validateFields(request);
        Integer capacity = request.capacity() == null ? null : request.capacity().intValueExact();
        Integer occupancy = request.occupancy() == null ? null : request.occupancy().intValueExact();
        return store.writeObservation(new Observation(request.kind(), request.siteId(), request.label().strip(),
                request.lat(), request.lng(), observedAt, observedAt.plus(request.kind().validity),
                request.sourceRef().strip(), request.value(), capacity, occupancy,
                request.state(), operator.name()));
    }

    @PostMapping("/handoffs")
    Handoff recordHandoff(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody HandoffRequest request) {
        var operator = authorizer.authenticate(jwt);
        if (!operator.canWrite(Scope.DISPATCH)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (request.state().prior() != request.expectedState()) throw badRequest("Invalid handoff transition");
        return store.writeHandoff(request.id(), request.reference().strip(), request.expectedState(),
                request.state(), operator.name());
    }

    private static void validateFields(ObservationRequest request) {
        boolean hasCounts = request.capacity() != null || request.occupancy() != null;
        switch (request.kind()) {
            case FLOOD -> {
                // Value is measured standing water in centimetres above the referenced surface.
                if (hasCounts || request.state() != null || request.value() == null ||
                        !(request.value() >= 0 && request.value() <= 2000)) {
                    throw badRequest("Flood observations require measured standing water depth in centimetres");
                }
            }
            case TRAFFIC -> {
                if (hasCounts || request.value() != null || request.state() == null) {
                    throw badRequest("Traffic observations require a road state");
                }
            }
            case SHELTER -> {
                if (request.value() != null || request.state() == null || !validCount(request.capacity()) ||
                        !validCount(request.occupancy()) || request.occupancy().compareTo(request.capacity()) > 0 ||
                        (request.state() == SiteState.OPEN && request.capacity().signum() == 0)) {
                    throw badRequest("Shelter observations require a state and valid occupancy and capacity");
                }
            }
        }
    }

    private static boolean validCount(BigDecimal value) {
        return value != null && value.signum() >= 0 && value.compareTo(BigDecimal.valueOf(100000)) <= 0
                && value.stripTrailingZeros().scale() <= 0;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    record Status(boolean available) {}
    record AccessRequest(@NotNull @Pattern(regexp = OPERATOR_PATTERN) String operator,
                         @NotBlank @Size(min = 32, max = 256) String code) {}
    record AccessToken(String token) {}
    record Board(String operator, Scope scope, List<Observation> observations, List<Handoff> handoffs) {}
    record ObservationRequest(@NotNull Kind kind, @NotNull @Pattern(regexp = "[A-Za-z0-9._:-]{1,64}") String siteId,
                              @NotBlank @Size(max = 100) String label, @NotNull Double lat, @NotNull Double lng,
                              @NotNull OffsetDateTime observedAt, @NotBlank @Size(max = 160) String sourceRef,
                              Double value, BigDecimal capacity, BigDecimal occupancy, SiteState state) {}
    record HandoffRequest(@NotNull UUID id, @NotNull @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9 /._:-]{0,79}")
                          String reference, HandoffState expectedState, @NotNull HandoffState state) {}
}
