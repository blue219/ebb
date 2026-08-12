# Domain language

Ebb helps a signed-in person define and execute a clear scope for liked videos on their Douyin account. Use these terms consistently in product copy, documentation, and code discussions.

## Clear scopes

**Clear scope**

The boundary that determines which account likes one removal task may remove.

_Avoid_: selection mode, delete mode

**All scope**

A clear scope that keeps loading from the signed-in account until Douyin returns no liked videos. It is a live boundary, not a frozen list of IDs; the person should not add likes while the task runs.

_Avoid_: select all, visible likes

**Limited scope**

A clear scope capped at a positive whole-number target. The target is frozen when the task starts, and the service loads more pages only as needed.

_Avoid_: partial all, batch selection

**Manual selection**

A clear scope containing only the loaded liked videos explicitly checked in the table. The selected IDs are frozen when the task starts. The UI labels this scope **Custom**.

_Avoid_: custom amount, limited scope

## Task terms

**Removal task**

One confirmed attempt to remove the likes defined by a clear scope. Internally, the service modes are `selected`, `limited`, and `all`.

**Pause**

Stop sending further unlike requests while retaining task progress. A request already in flight may finish before the pause takes effect.

**Continue**

Resume a paused removal task from its retained progress and boundary.

**Stop**

End the current removal task without processing its remaining items. Completed unlike requests remain applied to the account.

**Sign out**

Stop active work, clear Ebb's persistent Douyin browser storage on this device, and return the workspace to its signed-out state.

## Data terms

**Likes count**

The account total reported by Douyin. It sets the initial total for **All** and validates a **Limited** scope, but it can become stale if the account changes elsewhere.

**Loaded videos**

The liked-video rows currently held in memory. This is not necessarily the full account and must not be called “all likes.”

**Completed**

The unlike request for an item succeeded during the current app run. It does not mean the video was deleted from Douyin.
