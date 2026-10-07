package me.vestry.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.ContextKey;
import io.opentelemetry.context.Scope;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Dedicated, manually instrumented provider: no HTTP, database, session or credential auto-capture. */
public final class BriefingTracing implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(BriefingTracing.class);
    private static final ContextKey<Run> RUN = ContextKey.named("vestry-briefing");
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private final Tracer tracer;
    private final SdkTracerProvider provider;
    private final String environment;
    private final String release;
    private final boolean evaluation;
    private final AtomicBoolean closed = new AtomicBoolean();

    private record Run(String job, String kind, boolean content) {}

    public BriefingTracing(Tracer tracer, SdkTracerProvider provider, String environment,
                           String release, boolean evaluation) {
        this.tracer = tracer;
        this.provider = provider;
        this.environment = evaluation ? "evaluation" : environment;
        this.release = release;
        this.evaluation = evaluation;
    }

    public static BriefingTracing disabled() {
        return new BriefingTracing(OpenTelemetry.noop().getTracer("vestry-briefing"), null,
                "development", "", false);
    }

    public static BriefingTracing create(boolean enabled, String baseUrl, String publicKey,
                                          String secretKey, String environment, String release, boolean evaluation) {
        if (!enabled) return disabled();
        try {
            var uri = URI.create(baseUrl);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null
                    || publicKey.isBlank() || secretKey.isBlank()
                    || !environment.matches("[a-z0-9][a-z0-9_-]{0,39}")) {
                throw new IllegalArgumentException("Invalid tracing configuration");
            }
            String auth = Base64.getEncoder().encodeToString((publicKey + ":" + secretKey)
                    .getBytes(StandardCharsets.UTF_8));
            var exporter = OtlpHttpSpanExporter.builder()
                    .setEndpoint(baseUrl.replaceAll("/+$", "") + "/api/public/otel/v1/traces")
                    .addHeader("Authorization", "Basic " + auth)
                    .addHeader("x-langfuse-ingestion-version", "4")
                    .setTimeout(Duration.ofSeconds(5)).build();
            var provider = SdkTracerProvider.builder()
                    .setResource(Resource.create(Attributes.of(AttributeKey.stringKey("service.name"), "vestry-api")))
                    .addSpanProcessor(BatchSpanProcessor.builder(exporter)
                            .setMaxQueueSize(512).setMaxExportBatchSize(64)
                            .setScheduleDelay(Duration.ofSeconds(5)).setExporterTimeout(Duration.ofSeconds(5)).build())
                    .build();
            return new BriefingTracing(provider.get("vestry-briefing"), provider, environment, release, evaluation);
        } catch (RuntimeException invalid) {
            // Configuration failure must not disable the application or disclose keys/URLs.
            log.warn("Langfuse tracing disabled: check tracing configuration");
            return disabled();
        }
    }

    /** Starts on the worker thread; never inherit servlet session/request context. */
    public Observation briefing(UUID job, boolean demo) {
        var run = new Run(job.toString(), evaluation ? "evaluation" : demo ? "demo" : "user", demo || evaluation);
        return start("generate-portfolio-briefing", "chain", Context.root().with(RUN, run), run);
    }

    public Observation step(String name, String type) {
        var context = Context.current();
        var run = context.get(RUN);
        if (run == null) return new Observation(Span.getInvalid(), () -> {}, false);
        return start(name, type, context, run);
    }

    private Observation start(String name, String type, Context parent, Run run) {
        var span = tracer.spanBuilder(name).setParent(parent)
                .setAttribute("langfuse.observation.type", type)
                .setAttribute("langfuse.trace.name", "generate-portfolio-briefing")
                .setAttribute("langfuse.environment", environment)
                .setAttribute("langfuse.release", release)
                .setAttribute("langfuse.trace.public", false)
                .setAttribute(AttributeKey.stringArrayKey("langfuse.trace.tags"), List.of("portfolio-briefing", run.kind()))
                .setAttribute("langfuse.observation.metadata.job_id", run.job())
                .setAttribute("langfuse.observation.metadata.run_kind", run.kind())
                .setAttribute("langfuse.observation.metadata.content_capture", run.content() ? "full" : "metadata-only")
                .startSpan();
        return new Observation(span, parent.with(span).makeCurrent(), run.content());
    }

    public static String fingerprint(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    public final class Observation implements AutoCloseable {
        private final Span span;
        private final Scope scope;
        private final boolean content;

        private Observation(Span span, Scope scope, boolean content) {
            this.span = span;
            this.scope = scope;
            this.content = content;
        }

        public void attribute(String key, String value) { span.setAttribute(key, value); }
        public void metadata(String key, Object value) {
            attribute("langfuse.observation.metadata." + key, String.valueOf(value));
        }
        public void input(Object value) { if (content) json("langfuse.observation.input", value); }
        public void inputJson(String value) {
            if (!content || !span.isRecording()) return;
            try { input(JSON.readTree(value)); }
            catch (Exception ignored) { metadata("serialization_failed", true); }
        }
        public void output(Object value) { if (content) json("langfuse.observation.output", value); }
        public void summary(Map<String, ?> value) { json("langfuse.observation.output", value); }
        public void json(String key, Object value) {
            if (!span.isRecording()) return;
            try { attribute(key, JSON.writeValueAsString(value)); }
            catch (Exception ignored) { metadata("serialization_failed", true); }
        }
        /** Callers supply fixed categories, never exception messages, causes or provider error bodies. */
        public void failure(String category) {
            span.setStatus(StatusCode.ERROR, category);
            attribute("langfuse.observation.level", "ERROR");
            attribute("langfuse.observation.status_message", category);
        }
        @Override public void close() {
            scope.close();
            span.end();
        }
    }

    /** Bounded drain for Spring shutdown and short-lived Promptfoo processes, never per request. */
    @Override public void close() {
        if (provider == null || !closed.compareAndSet(false, true)) return;
        provider.forceFlush().join(6, TimeUnit.SECONDS);
        provider.shutdown().join(6, TimeUnit.SECONDS);
    }
}
