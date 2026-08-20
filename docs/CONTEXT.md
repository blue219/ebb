# Domain language

Ebb helps a signed-in person define and execute batch changes for liked videos and followed accounts on their Douyin account. Use these terms consistently in product copy, documentation, and code discussions.

## Batch scopes

**Batch scope**

The boundary that determines which liked videos or following accounts one batch task may change.

_Avoid_: clear scope, selection mode, delete mode

**All scope**

A batch scope that keeps loading from the signed-in account until Douyin returns no matching items. It is a live boundary, not a frozen list of IDs; likes or follows added elsewhere while the task runs may enter the scope.

_Avoid_: select all, visible likes

**Limited scope**

A batch scope capped at a positive whole-number target. The target is frozen when the task starts, and the task loads more pages only as needed.

_Avoid_: partial all, batch selection

**Manual selection**

A batch scope containing only the loaded videos or following accounts explicitly checked in the table. The selected stable IDs are frozen when the task starts. The UI labels this scope **Custom**.

_Avoid_: custom amount, limited scope

## Task terms

**Like-removal task**

One confirmed attempt to remove the likes defined by a batch scope. Internally, the service modes are `selected`, `limited`, and `all`.

**Unfollow task**

One confirmed attempt to unfollow the accounts defined by a batch scope. Mutual follows remain eligible because they are following accounts.

**Pause**

Stop sending further unlike or unfollow requests while retaining task progress and the global batch-task lock. A request already in flight may finish before the pause takes effect.

**Continue**

Resume a paused batch task from its retained progress and boundary.

**Stop**

End the current batch task without processing its remaining items. Completed unlike or unfollow requests remain applied to the account.

**Sign out**

Stop active work, release the global batch-task lock, clear Ebb's persistent Douyin browser storage on this device, and return the workspace to its signed-out state.

## Data terms

**Likes count**

The account total reported by Douyin. It sets the initial total for **All** and validates a **Limited** scope, but it can become stale if the account changes elsewhere.

**Following account**

An account the signed-in person currently follows, identified by Douyin's stable secured user ID.

_Avoid_: follower, fan

**Mutual follow**

A following account that also follows the signed-in person. It remains part of every applicable batch scope unless the person excludes it manually.

_Avoid_: friend

**Following count**

The account total reported by Douyin. It sets the initial total for an unfollow **All** scope and validates a **Limited** scope, but it can become stale if the account changes elsewhere.

**Loaded videos**

The liked-video rows currently held in memory. This is not necessarily the full account and must not be called “all likes.”

**Loaded following accounts**

The following-account rows currently held in memory. This is not necessarily the full following list and must not be called “all follows.”

**Prefetched videos**

Liked-video rows kept privately in memory after a background page request. They are not yet visible or selectable, and become loaded videos only when the active queue needs them.

**Completed**

The unlike or unfollow request for an item succeeded during the current app run. It does not mean a video was deleted or that Ebb can restore the previous relationship.
