package me.vestry.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GoogleSignInVerifierTest {

    private static final String CLIENT_ID = "vestry-test.apps.googleusercontent.com";
    private final RestTemplate http = new RestTemplate();
    private final MockRestServiceServer google = MockRestServiceServer.bindTo(http).build();
    private final GoogleSignInVerifier verifier = new GoogleSignInVerifier(CLIENT_ID, http);

    private void answer(String json) {
        google.expect(requestTo("https://oauth2.googleapis.com/tokeninfo?access_token=token%2Bvalue"))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    @Test
    void acceptsATokenGoogleIssuedToThisApp() {
        answer("{\"aud\":\"" + CLIENT_ID + "\",\"sub\":\"google-123\",\"email\":\"casey.lee@gmail.com\",\"expires_in\":\"3500\"}");
        assertEquals(new GoogleSignInVerifier.GoogleIdentity("google-123", "casey.lee@gmail.com"),
                verifier.verify("token+value").orElseThrow());
        google.verify();
    }

    @Test
    void rejectsTokensForOtherAppsOrWithoutAnAccountId() {
        answer("{\"aud\":\"another-app.apps.googleusercontent.com\",\"sub\":\"google-123\"}");
        assertTrue(verifier.verify("token+value").isEmpty());
        google.reset();
        answer("{\"aud\":\"" + CLIENT_ID + "\"}");
        assertTrue(verifier.verify("token+value").isEmpty());
    }

    @Test
    void rejectsTokensGoogleRefusesAndNeverCallsGoogleWhenOff() {
        google.expect(requestTo("https://oauth2.googleapis.com/tokeninfo?access_token=expired"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).body("{\"error\":\"invalid_token\"}"));
        assertTrue(verifier.verify("expired").isEmpty());
        assertTrue(verifier.verify(" ").isEmpty());

        var off = new GoogleSignInVerifier(" ", http);
        assertFalse(off.enabled());
        assertNull(off.clientId());
        assertTrue(off.verify("token").isEmpty());
        google.verify();
    }
}
