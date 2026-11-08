import type { CapabilityDescriptor, EventPage, EventStreamIntegrity, KnownEventType, ValidationIssue } from "./types.js";
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
  declaredCapabilities: readonly CapabilityDescriptor[],
): boolean {
  if (!isKnownEventType(eventType)) return false;

  const requiredCapability = EVENT_CAPABILITY_REQUIREMENTS[eventType];
  if (requiredCapability === undefined) return true;

  const descriptor = declaredCapabilities.find((capability) => capability.id === requiredCapability);
  return descriptor !== undefined &&
    descriptor.status !== "unavailable" &&
    descriptor.eventTypes.includes(eventType);
}

function sumGapSizes(integrity: EventStreamIntegrity): bigint {
  return integrity.sequenceGaps.reduce(
    (total, gap) => total + BigInt(gap.toSequence) - BigInt(gap.fromSequence) + 1n,
    0n,
  );
}

export function validateEventPageSemantics(page: EventPage): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let previousSequence = 0;
  const eventIds = new Set<string>();

  for (const event of page.events) {
    if (eventIds.has(event.eventId)) {
      issues.push({
        code: "EVENT_ID_DUPLICATED",
        path: "/events",
        message: "Event identifiers must be unique within a page.",
      });
    }
    eventIds.add(event.eventId);
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

  if (overflow.occurred && overflow.droppedEventCount === null && page.integrity.lostEventCount !== null) {
    issues.push({
      code: "EVENT_LOSS_COUNT_INCONSISTENT",
      path: "/integrity/lostEventCount",
      message: "The total lost count must remain unknown when overflow drops are uncounted.",
    });
  }

  const knownGapCount = sumGapSizes(page.integrity);
  const droppedCount = overflow.droppedEventCount ?? 0;
  const knownLostCount = page.integrity.lostEventCount;

  if (
    knownLostCount !== null &&
    (BigInt(knownLostCount) < knownGapCount || knownLostCount < droppedCount)
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
