package me.vestry.service;

import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.UUID;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiGenerationServiceTest {
    private final AiBudgetService budget = mock(AiBudgetService.class);
    private final ThreadPoolTaskExecutor executor = mock(ThreadPoolTaskExecutor.class);
    private final AiGenerationService service = new AiGenerationService(budget, executor);
    private final UUID job = UUID.randomUUID();

    @Test
    void duplicateDoesNotRunOrRefundWork() {
        when(budget.start("key", 1000)).thenReturn(new AiBudgetService.Start(job, false));
        assertEquals(job, service.submit("key", 1000, id -> fail("Duplicate ran")));
        verifyNoInteractions(executor);
        verify(budget, never()).finish(any(), anyBoolean());
    }

    @Test
    void recordsSuccessAndFailureWithoutPropagatingPrivateWorkerErrors() {
        when(budget.start("key", 1000)).thenReturn(new AiBudgetService.Start(job, true));
        doAnswer(invocation -> { invocation.<Runnable>getArgument(0).run(); return null; })
                .when(executor).execute(any(Runnable.class));
        Consumer<UUID> work = mock(Consumer.class);
        assertEquals(job, service.submit("key", 1000, work));
        verify(work).accept(job);
        verify(budget).finish(job, true);
        assertDoesNotThrow(() -> service.submit("key", 1000, id -> { throw new IllegalStateException("private context"); }));
        verify(budget).finish(job, false);
    }

    @Test
    void rejectedWorkerReleasesUnspentReservation() {
        when(budget.start("key", 1000)).thenReturn(new AiBudgetService.Start(job, true));
        doThrow(new TaskRejectedException("busy")).when(executor).execute(any(Runnable.class));
        assertThrows(IllegalStateException.class, () -> service.submit("key", 1000, id -> fail("Rejected work ran")));
        verify(budget).finish(job, false);
    }
}
