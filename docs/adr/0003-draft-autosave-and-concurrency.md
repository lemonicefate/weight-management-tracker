# ADR 0003 — Draft Encounter autosave with optimistic concurrency

An Encounter is created only after the user explicitly chooses New Encounter.

The new Encounter begins as Draft.

Draft changes autosave so accidental Back navigation, tab closing or browser closing does not intentionally discard successfully saved data.

Only an explicit Complete Encounter action changes Draft to Completed.

A completely empty Draft may be automatically cleaned up. Once clinical content exists, the record is not silently destroyed.

Multiple clinic devices may edit/view the same Encounter, therefore the backend uses optimistic concurrency with an Encounter revision/version. A client saving an older version is rejected with a visible conflict rather than silently overwriting newer data.

Completed Encounter changes use reopen/correction behavior with meaningful audit information.

This avoids both common failure modes: losing work because a user accidentally leaves the page, and losing another user's newer edit through last-write-wins behavior.
