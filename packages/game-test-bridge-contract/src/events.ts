import type { EventPage, EventStreamIntegrity, KnownEventType, ValidationIssue } from "./types.js";
import { EVENT_CAPABILITY_REQUIREMENTS } from "./capabilities.js";

const KNOWN_EVENT_TYPES = new Set<string>([
  "scene.started",
  "scene.ready",
  "scene.stopped",
  "entity.spawned",
  "entity.destroyed",
  "component.attached",
  "component.detached",
  "resource.loaded",
  "resource.failed",
  "animation.started",
  "animation.completed",
  "animation.stopped",
  "input.observed",
  "runtime.paused",
  "runtime.resumed",
  "scene.transitioned",
  "gameplay.semantic",
  "physics.contact",
]);

export function isKnownEventType(eventType: string): eventType is KnownEventType {
  return KNOWN_EVENT_TYPES.has(eventType);
}

export function isEventTypeAvailable(
  eventType: string,
  availableCapabilityIds: ReadonlySet<string>,
): boolean {
  const requiredCapability = EVENT_CAPABILITY_REQUIREMENTS[eventType];
  return requiredCapability === undefined || availableCapabilityIds.has(requiredCapability);
}

function sumGapSizes(integrity: EventStreamIntegrity): number {
  return integrity.sequenceGaps.reduce(
    (total, gap) => total + gap.toSequence - gap.fromSequence + 1,
    0,
  );
}

export function validateEventPageSemantics(page: EventPage): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let previousSequence = 0;

  for (const event of page.events) {
    if (event.testSessionId !== page.testSessionId) {
      issues.push({
        code: "EVENT_SESSION_MISMATCH",
        path: "/events",
        message: "Every event in a page must belong to the page test session.",
      });
    }

    if (event.sequence <= previousSequence) {
      issues.push({
        code: "EVENT_SEQUENCE_NOT_MONOTONIC",
        path: "/events",
        message: "Event sequence numbers must be strictly increasing within a page.",
      });
    }
    previousSequence = event.sequence;
  }

  let previousGapEnd = 0;
  for (const gap of page.integrity.sequenceGaps) {
    if (gap.fromSequence > gap.toSequence || gap.fromSequence <= previousGapEnd) {
      issues.push({
        code: "EVENT_GAP_RANGE_INVALID",
        path: "/integrity/sequenceGaps",
        message: "Sequence gap ranges must be ordered, non-overlapping and have a positive width.",
      });
    }
    previousGapEnd = gap.toSequence;

    if (page.events.some((event) =>
      event.sequence >= gap.fromSequence && event.sequence <= gap.toSequence
    )) {
      issues.push({
        code: "EVENT_GAP_OVERLAPS_DELIVERED_EVENT",
        path: "/integrity/sequenceGaps",
        message: "A declared lost sequence range cannot contain an event delivered in the same page.",
      });
    }
  }

  const overflow = page.integrity.bufferOverflow;
  if (overflow.capacity < 1) {
    issues.push({
      code: "EVENT_BUFFER_CAPACITY_INVALID",
      path: "/integrity/bufferOverflow/capacity",
      message: "An event buffer capacity must be a positive integer.",
    });
  }

  if (
    (overflow.occurred && overflow.droppedEventCount === 0) ||
    (!overflow.occurred && overflow.droppedEventCount !== 0)
  ) {
    issues.push({
      code: "EVENT_OVERFLOW_DIAGNOSTIC_INCONSISTENT",
      path: "/integrity/bufferOverflow",
      message: "Overflow state and dropped event count must agree.",
    });
  }

  const knownGapCount = sumGapSizes(page.integrity);
  const droppedCount = overflow.droppedEventCount ?? 0;
  const knownLostCount = page.integrity.lostEventCount;

  if (
    knownLostCount !== null &&
    (knownLostCount < knownGapCount || knownLostCount < droppedCount)
  ) {
    issues.push({
      code: "EVENT_LOSS_COUNT_INCONSISTENT",
      path: "/integrity/lostEventCount",
      message: "The known lost event count cannot be lower than explicitly reported gaps or overflow drops.",
    });
  }

  const hasKnownLoss =
    page.integrity.sequenceGaps.length > 0 ||
    overflow.occurred ||
    (knownLostCount !== null && knownLostCount > 0);

  if (page.integrity.coverage === "complete" && hasKnownLoss) {
    issues.push({
      code: "EVENT_COVERAGE_OVERCLAIMED",
      path: "/integrity/coverage",
      message: "A stream with detected event loss cannot claim complete coverage.",
    });
  }

  if (page.integrity.coverage === "partial" && !hasKnownLoss) {
    issues.push({
      code: "EVENT_PARTIAL_COVERAGE_WITHOUT_DIAGNOSTIC",
      path: "/integrity/coverage",
      message: "Partial coverage must include a sequence gap, overflow or known lost event.",
    });
  }

  if (page.hasMore !== (page.nextCursor !== null)) {
    issues.push({
      code: "EVENT_PAGE_CURSOR_INCONSISTENT",
      path: "/nextCursor",
      message: "nextCursor must be present exactly when hasMore is true.",
    });
  }

  return issues;
}
