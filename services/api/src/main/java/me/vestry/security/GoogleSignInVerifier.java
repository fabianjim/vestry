package me.vestry.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Map;
import java.util.Optional;

/**
 * Confirms a Google access token from the sign-in popup with Google itself, and that Google
 * issued it to this app's client ID. A token issued to any other app is rejected. Disabled
 * when no client ID is configured.
 */
@Component
public class GoogleSignInVerifier {

    private static final String TOKEN_INFO = "https://oauth2.googleapis.com/tokeninfo";

    public record GoogleIdentity(String subject, String email) {}

    private final String clientId;
    private final RestTemplate http;

    @Autowired
    public GoogleSignInVerifier(@Value("${vestry.google.client-id:}") String clientId) {
        this(clientId, timeouts());
    }

    GoogleSignInVerifier(String clientId, RestTemplate http) {
        this.clientId = clientId == null ? "" : clientId.trim();
        this.http = http;
    }

    private static RestTemplate timeouts() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(5_000);
        return new RestTemplate(factory);
    }

    public boolean enabled() {
        return !clientId.isEmpty();
    }

    /** The public client ID the browser needs to open Google's popup, or null when disabled. */
    public String clientId() {
        return enabled() ? clientId : null;
    }

    public Optional<GoogleIdentity> verify(String accessToken) {
        if (!enabled() || accessToken == null || accessToken.isBlank()) return Optional.empty();
        try {
            // Expanding a template variable encodes every reserved character, including '+'.
            URI uri = UriComponentsBuilder.fromUriString(TOKEN_INFO).queryParam("access_token", "{token}")
                    .encode().buildAndExpand(accessToken).toUri();
            Map<?, ?> info = http.getForObject(uri, Map.class);
            // Google answers with an error status for expired or unknown tokens.
            if (info == null || !clientId.equals(info.get("aud"))) return Optional.empty();
            Object subject = info.get("sub");
            if (!(subject instanceof String id) || id.isBlank()) return Optional.empty();
            Object email = info.get("email");
            return Optional.of(new GoogleIdentity(id, email instanceof String address ? address : null));
        } catch (RestClientException e) {
            return Optional.empty();
        }
    }
}
