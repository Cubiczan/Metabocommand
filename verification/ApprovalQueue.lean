/-
  MetaboCommand — approval queue / orchestration core: formal model.

  Modelled from source (no source files were modified):

  * The governance watchdog (Rust kernel):
      crates/metabocommand-kernel/src/governance.rs
        agent_profiles        ll. 132–289   (hardcoded per-agent profiles)
        max_observed_amount   ll. 291–301
        policy_flags          ll. 344–371
        assess_governance_action ll. 413–448
        build_evidence_packet ll. 450–522
    exposed to TypeScript via src/lib/governance-watchdog.ts and
    src/lib/rust-governance.ts (transport only, no rule logic).

  * The approval queue (Supabase table `approval_items`,
    supabase/migrations/0001_schema.sql ll. 61–79; RLS ll. 184–192) with
    exactly two write paths:
      - REST:  src/app/api/approvals/submit/route.ts  (insert, status
               `pending`), src/app/api/approvals/decide/route.ts
               (auth + profile-role == queue + pending check + CAS update).
      - MCP:   scripts/mcp-server.ts (service-role client, ll. 17–21;
               `submit_approval` ll. 152–194, `decide_approval`
               ll. 206–251) — no caller authentication at all.

  * There is NO execution path in the repository: nothing consumes items
    with status `approved`. The evidence packet states the intended
    boundary — "Action must stay in the approval queue until an
    authorized human decision is recorded" (governance.rs, approval
    boundary text in build_evidence_packet). We therefore model
    `Executable s qid` as "an external executor would be permitted to
    act", i.e. the item is `approved`, and prove which states can and
    cannot reach it.

  Abstractions (documented in NOTES.md):
  - Money (f64 in Rust, numeric in SQL) is abstracted to the single
    boolean `crossesLimit` = "max observed amount > autonomous_limit",
    the only comparison `assess_governance_action` performs.
  - Item ids are `Nat` standing in for UUIDs; insertion requires a
    fresh id (primary-key semantics).
  - The watchdog's text-regex policy flags are abstracted to two
    booleans: `irreversible` (the `irreversible_external_action` flag,
    the only flag that changes the decision class by itself) and
    `flagged` (any other flag present).
-/

namespace MetaboCommand

/-! ## 1. The watchdog (Rust kernel, `assess_governance_action`) -/

inductive Queue where
  | finance
  | operations
  deriving DecidableEq, Repr, Inhabited

/-- The kernel's `WatchdogDecision` (governance.rs ll. 34–39). -/
inductive WatchdogDecision where
  | pass
  | approvalRequired
  | blocked
  deriving DecidableEq, Repr, Inhabited

/-- Inputs to `assess_governance_action` (governance.rs ll. 413–448),
    abstracted as described in the header. `trustNeedsApproval` is
    `profile.trust_level == TrustLevel::ApprovalRequired`. -/
structure AssessmentInput where
  irreversible : Bool
  flagged : Bool
  trustNeedsApproval : Bool
  crossesLimit : Bool
  deriving DecidableEq, Repr

/-- The watchdog decision, in the kernel's exact branch order:
    blocked iff the irreversible flag is present; otherwise
    approval-required iff any flag is present, the agent's trust level
    demands approval, or the observed amount crosses the autonomous
    limit; otherwise pass. -/
def assess (i : AssessmentInput) : WatchdogDecision :=
  if i.irreversible then .blocked
  else if i.flagged || i.trustNeedsApproval || i.crossesLimit then .approvalRequired
  else .pass

theorem assess_blocked_iff (i : AssessmentInput) :
    assess i = .blocked ↔ i.irreversible = true := by
  cases h1 : i.irreversible <;> cases h2 : i.flagged <;>
    cases h3 : i.trustNeedsApproval <;> cases h4 : i.crossesLimit <;>
    simp [assess, h1, h2, h3, h4]

theorem assess_pass_iff (i : AssessmentInput) :
    assess i = .pass ↔
      i.irreversible = false ∧ i.flagged = false ∧
      i.trustNeedsApproval = false ∧ i.crossesLimit = false := by
  cases h1 : i.irreversible <;> cases h2 : i.flagged <;>
    cases h3 : i.trustNeedsApproval <;> cases h4 : i.crossesLimit <;>
    simp [assess, h1, h2, h3, h4]

theorem assess_approvalRequired_iff (i : AssessmentInput) :
    assess i = .approvalRequired ↔
      i.irreversible = false ∧
      (i.flagged = true ∨ i.trustNeedsApproval = true ∨ i.crossesLimit = true) := by
  cases h1 : i.irreversible <;> cases h2 : i.flagged <;>
    cases h3 : i.trustNeedsApproval <;> cases h4 : i.crossesLimit <;>
    simp [assess, h1, h2, h3, h4]

/-! ## 2. The approval queue store -/

inductive Status where
  | pending
  | approved
  | rejected
  deriving DecidableEq, Repr, Inhabited

inductive Decision where
  | approve
  | reject
  deriving DecidableEq, Repr

def Decision.toStatus : Decision → Status
  | .approve => .approved
  | .reject => .rejected

/-- One row of `approval_items` (0001_schema.sql ll. 61–79), restricted
    to the fields the state machine reads or writes. Note — following
    the schema — there is NO submitter field: neither submit path
    records who submitted an item, so "the decider must differ from the
    submitter" is not even expressible over this data. -/
structure Item where
  id : Nat
  queue : Queue
  watchdog : WatchdogDecision
  status : Status
  decidedBy : Option String
  deriving DecidableEq, Repr

abbrev Store := List Item

def findItem (s : Store) (qid : Nat) : Option Item :=
  match s with
  | [] => none
  | it :: rest => if it.id = qid then some it else findItem rest qid

/-- In-place update of the (unique) row with id `qid`, as performed by
    the SQL `UPDATE ... WHERE id = qid`. -/
def setItem (s : Store) (qid : Nat) (new : Item) : Store :=
  s.map (fun it => if it.id = qid then new else it)

theorem findItem_id {s : Store} {qid : Nat} {it : Item}
    (h : findItem s qid = some it) : it.id = qid := by
  induction s with
  | nil => simp [findItem] at h
  | cons a rest ih =>
    simp only [findItem] at h
    by_cases ha : a.id = qid
    · rw [if_pos ha] at h
      injection h with h'
      rw [← h', ha]
    · rw [if_neg ha] at h
      exact ih h

theorem findItem_mem {s : Store} {qid : Nat} {it : Item}
    (h : findItem s qid = some it) : it ∈ s := by
  induction s with
  | nil => simp [findItem] at h
  | cons a rest ih =>
    simp only [findItem] at h
    by_cases ha : a.id = qid
    · rw [if_pos ha] at h
      injection h with h'
      subst h'
      exact List.mem_cons_self
    · rw [if_neg ha] at h
      exact List.mem_cons_of_mem a (ih h)

theorem findItem_eq_none_of_not_mem {s : Store} {qid : Nat}
    (h : qid ∉ s.map Item.id) : findItem s qid = none := by
  induction s with
  | nil => rfl
  | cons a rest ih =>
    simp only [findItem]
    by_cases ha : a.id = qid
    · exact absurd (List.mem_cons.mpr (Or.inl ha.symm)) h
    · rw [if_neg ha]
      refine ih (fun hm => h ?_)
      exact List.mem_cons.mpr (Or.inr hm)

theorem mem_ids_of_findItem {s : Store} {qid : Nat} {it : Item}
    (h : findItem s qid = some it) : qid ∈ s.map Item.id := by
  have hmem := findItem_mem h
  have hid := findItem_id h
  have hmap : Item.id it ∈ s.map Item.id := List.mem_map.mpr ⟨it, hmem, rfl⟩
  exact hid ▸ hmap

theorem findItem_cons (a : Item) (rest : Store) (qid : Nat) :
    findItem (a :: rest) qid =
      if a.id = qid then some a else findItem rest qid := rfl

theorem setItem_cons (a : Item) (rest : Store) (qid : Nat) (new : Item) :
    setItem (a :: rest) qid new =
      (if a.id = qid then new else a) :: setItem rest qid new := rfl

theorem findItem_setItem_same {s : Store} {qid : Nat} {new : Item}
    (hnew : new.id = qid) (h : findItem s qid = some it) :
    findItem (setItem s qid new) qid = some new := by
  induction s with
  | nil => simp [findItem] at h
  | cons a rest ih =>
    rw [findItem_cons] at h
    by_cases ha : a.id = qid
    · rw [if_pos ha] at h
      rw [setItem_cons, if_pos ha, findItem_cons, if_pos hnew]
    · rw [if_neg ha] at h
      rw [setItem_cons, if_neg ha, findItem_cons, if_neg ha]
      exact ih h

theorem findItem_setItem_ne {s : Store} {qid qid₂ : Nat} {new : Item}
    (hnew : new.id = qid) (hne : qid₂ ≠ qid) :
    findItem (setItem s qid new) qid₂ = findItem s qid₂ := by
  induction s with
  | nil => rfl
  | cons a rest ih =>
    rw [setItem_cons, findItem_cons, findItem_cons]
    by_cases ha : a.id = qid
    · rw [if_pos ha]
      have h1 : new.id ≠ qid₂ := by rw [hnew]; exact Ne.symm hne
      rw [if_neg h1]
      have h2 : a.id ≠ qid₂ := by rw [ha]; exact Ne.symm hne
      rw [if_neg h2]
      exact ih
    · rw [if_neg ha]
      by_cases ha₂ : a.id = qid₂
      · rw [if_pos ha₂, if_pos ha₂]
      · rw [if_neg ha₂, if_neg ha₂]
        exact ih

theorem setItem_map_id {s : Store} {qid : Nat} {new : Item}
    (hnew : new.id = qid) :
    (setItem s qid new).map Item.id = s.map Item.id := by
  induction s with
  | nil => rfl
  | cons a rest ih =>
    rw [setItem_cons, List.map_cons, List.map_cons]
    by_cases ha : a.id = qid
    · rw [if_pos ha, ih, hnew, ha]
    · rw [if_neg ha, ih]

/-! ## 3. The CAS decision write shared by both decide paths

    Both `decide` implementations (REST route ll. 49–56, MCP server
    ll. 220–226) perform
    `UPDATE approval_items SET status = ?, decided_by = ?
     WHERE id = ? AND status = 'pending'`.
    `applyDecision` is that write, given the row as read. -/

def applyDecision (s : Store) (qid : Nat) (actor : String) (d : Decision) : Store :=
  match findItem s qid with
  | none => s
  | some it =>
    if it.status = .pending then
      setItem s qid { it with status := d.toStatus, decidedBy := some actor }
    else s

theorem applyDecision_none {s : Store} {qid : Nat} {actor : String} {d : Decision}
    (h : findItem s qid = none) :
    applyDecision s qid actor d = s := by
  simp [applyDecision, h]

theorem applyDecision_not_pending {s : Store} {qid : Nat} {it : Item}
    {actor : String} {d : Decision}
    (h : findItem s qid = some it) (hst : it.status ≠ .pending) :
    applyDecision s qid actor d = s := by
  simp [applyDecision, h, hst]

theorem applyDecision_pending {s : Store} {qid : Nat} {it : Item}
    {actor : String} {d : Decision}
    (h : findItem s qid = some it) (hst : it.status = .pending) :
    findItem (applyDecision s qid actor d) qid =
      some { it with status := d.toStatus, decidedBy := some actor } := by
  have hid : it.id = qid := findItem_id h
  simp only [applyDecision, h, hst, if_true]
  apply findItem_setItem_same _ h
  simp [hid]

theorem applyDecision_other {s : Store} {qid qid₂ : Nat} {actor : String}
    {d : Decision} (hne : qid₂ ≠ qid) :
    findItem (applyDecision s qid actor d) qid₂ = findItem s qid₂ := by
  cases hf : findItem s qid with
  | none => simp [applyDecision, hf]
  | some it =>
    by_cases hst : it.status = .pending
    · have hid : it.id = qid := findItem_id hf
      simp only [applyDecision, hf, hst, if_true]
      apply findItem_setItem_ne _ hne
      simp [hid]
    · simp [applyDecision, hf, hst]

theorem applyDecision_map_id {s : Store} {qid : Nat} {actor : String}
    {d : Decision} :
    (applyDecision s qid actor d).map Item.id = s.map Item.id := by
  cases hf : findItem s qid with
  | none => simp [applyDecision, hf]
  | some it =>
    by_cases hst : it.status = .pending
    · have hid : it.id = qid := findItem_id hf
      simp only [applyDecision, hf, hst, if_true]
      apply setItem_map_id
      simp [hid]
    · simp [applyDecision, hf, hst]

/-! ## 4. The two write paths, as functions on the store -/

inductive OpResult where
  | ok
  | notFound
  | alreadyDecided
  | forbidden
  | conflict
  deriving DecidableEq, Repr

/-- `INSERT` guarded by the primary key: a duplicate id is a conflict
    and leaves the store unchanged (the route returns 500). -/
def insertItem (s : Store) (it : Item) : Store × OpResult :=
  if (findItem s it.id).isSome then (s, .conflict)
  else (it :: s, .ok)

theorem insertItem_cases (s : Store) (it : Item) :
    (findItem s it.id = none ∧ insertItem s it = (it :: s, .ok)) ∨
    (findItem s it.id ≠ none ∧ insertItem s it = (s, .conflict)) := by
  cases hf : findItem s it.id with
  | none => exact Or.inl ⟨rfl, by simp [insertItem, hf]⟩
  | some x => exact Or.inr ⟨by simp, by simp [insertItem, hf]⟩

/-- REST submit (submit/route.ts): the caller must be authenticated
    with profile role equal to the target queue (l. 33); the
    watchdog packet is computed (l. 37) and STORED on the item,
    but its value is never consulted — the insert (ll. 45–62) happens
    for `pass`, `approvalRequired` and `blocked` alike. The submitter's
    identity (`_submitter`) is accepted and then discarded: the schema
    has no column for it, so no later check can use it. -/
def submitREST (s : Store) (_submitter : String) (callerQueue q : Queue)
    (newId : Nat) (wd : WatchdogDecision) : Store × OpResult :=
  if callerQueue ≠ q then (s, .forbidden)
  else insertItem s
    { id := newId, queue := q, watchdog := wd, status := .pending, decidedBy := none }

/-- MCP submit (mcp-server.ts `submitApproval`, ll. 152–194): no
    authentication, no role check — the server holds the service-role
    key (ll. 17–21), which bypasses RLS entirely. -/
def submitMCP (s : Store) (q : Queue) (newId : Nat)
    (wd : WatchdogDecision) : Store × OpResult :=
  insertItem s
    { id := newId, queue := q, watchdog := wd, status := .pending, decidedBy := none }

/-- REST decide (decide/route.ts): fetch the item filtered by
    `queue = caller role` (ll. 35–39, so a wrong-queue item is a 404),
    refuse non-pending items (ll. 44–45), then the CAS update
    (ll. 49–56). The decider's profile id is recorded as `decidedBy`. -/
def decideREST (s : Store) (qid : Nat) (caller : String) (callerQueue : Queue)
    (d : Decision) : Store × OpResult :=
  match findItem s qid with
  | none => (s, .notFound)
  | some it =>
    if it.queue ≠ callerQueue then (s, .notFound)
    else if it.status ≠ .pending then (s, .alreadyDecided)
    else (applyDecision s qid caller d, .ok)

/-- MCP decide (mcp-server.ts `decideApproval`, ll. 206–251): same
    fetch/check/CAS shape, but NO authentication, NO queue check, and
    `decidedBy` is whatever string the caller supplies (l. 224). -/
def decideMCP (s : Store) (qid : Nat) (caller : String)
    (d : Decision) : Store × OpResult :=
  match findItem s qid with
  | none => (s, .notFound)
  | some it =>
    if it.status ≠ .pending then (s, .alreadyDecided)
    else (applyDecision s qid caller d, .ok)

/-! ### Submission theorems -/

theorem submitREST_ok_fst {s : Store} {sub : String} {cq q : Queue}
    {nid : Nat} {wd : WatchdogDecision}
    (h : (submitREST s sub cq q nid wd).2 = .ok) :
    (submitREST s sub cq q nid wd).1 =
      { id := nid, queue := q, watchdog := wd, status := .pending,
        decidedBy := none } :: s := by
  have hcases := insertItem_cases s
    { id := nid, queue := q, watchdog := wd, status := .pending, decidedBy := none }
  unfold submitREST at h ⊢
  by_cases hq : cq = q
  · rw [if_neg (not_not_intro hq)] at h ⊢
    cases hcases with
    | inl hl => rw [hl.2] at h ⊢
    | inr hr => rw [hr.2] at h; simp at h
  · rw [if_pos hq] at h
    simp at h

theorem submitREST_ok_fresh {s : Store} {sub : String} {cq q : Queue}
    {nid : Nat} {wd : WatchdogDecision}
    (h : (submitREST s sub cq q nid wd).2 = .ok) :
    findItem s nid = none ∧ cq = q := by
  have hcases := insertItem_cases s
    { id := nid, queue := q, watchdog := wd, status := .pending, decidedBy := none }
  unfold submitREST at h
  by_cases hq : cq = q
  · rw [if_neg (not_not_intro hq)] at h
    cases hcases with
    | inl hl => exact ⟨hl.1, hq⟩
    | inr hr => rw [hr.2] at h; simp at h
  · rw [if_pos hq] at h
    simp at h

theorem submitMCP_ok_fst {s : Store} {q : Queue} {nid : Nat}
    {wd : WatchdogDecision}
    (h : (submitMCP s q nid wd).2 = .ok) :
    (submitMCP s q nid wd).1 =
      { id := nid, queue := q, watchdog := wd, status := .pending,
        decidedBy := none } :: s ∧ findItem s nid = none := by
  have hcases := insertItem_cases s
    { id := nid, queue := q, watchdog := wd, status := .pending, decidedBy := none }
  unfold submitMCP at h ⊢
  cases hcases with
  | inl hl => exact ⟨by rw [hl.2], hl.1⟩
  | inr hr => rw [hr.2] at h; simp at h

/-- A successful submission always creates a PENDING item — for every
    watchdog decision, including `blocked`. The watchdog verdict is
    recorded as metadata and gates nothing. -/
theorem submitREST_creates_pending {s : Store} {sub : String} {cq q : Queue}
    {nid : Nat} {wd : WatchdogDecision}
    (h : (submitREST s sub cq q nid wd).2 = .ok) :
    findItem (submitREST s sub cq q nid wd).1 nid =
      some { id := nid, queue := q, watchdog := wd, status := .pending,
             decidedBy := none } := by
  rw [submitREST_ok_fst h, findItem_cons, if_pos rfl]

theorem submitMCP_creates_pending {s : Store} {q : Queue} {nid : Nat}
    {wd : WatchdogDecision}
    (h : (submitMCP s q nid wd).2 = .ok) :
    findItem (submitMCP s q nid wd).1 nid =
      some { id := nid, queue := q, watchdog := wd, status := .pending,
             decidedBy := none } := by
  rw [submitMCP_ok_fst h |>.1, findItem_cons, if_pos rfl]

/-- Submission never disturbs existing rows. -/
theorem submitREST_preserves {s : Store} {sub : String} {cq q : Queue}
    {nid qid : Nat} {wd : WatchdogDecision} {it : Item}
    (h : (submitREST s sub cq q nid wd).2 = .ok)
    (hf : findItem s qid = some it) :
    findItem (submitREST s sub cq q nid wd).1 qid = some it := by
  have hfresh : findItem s nid = none := (submitREST_ok_fresh h).1
  have hne : nid ≠ qid := by
    intro hh
    rw [hh, hf] at hfresh
    simp at hfresh
  rw [submitREST_ok_fst h, findItem_cons, if_neg hne]
  exact hf

theorem submitMCP_preserves {s : Store} {q : Queue}
    {nid qid : Nat} {wd : WatchdogDecision} {it : Item}
    (h : (submitMCP s q nid wd).2 = .ok)
    (hf : findItem s qid = some it) :
    findItem (submitMCP s q nid wd).1 qid = some it := by
  have hfresh : findItem s nid = none := (submitMCP_ok_fst h).2
  have hne : nid ≠ qid := by
    intro hh
    rw [hh, hf] at hfresh
    simp at hfresh
  rw [(submitMCP_ok_fst h).1, findItem_cons, if_neg hne]
  exact hf

/-! ### Decision theorems -/

/-- The REST decide result is a function of exactly two fields of the
    stored row — its queue and its status. The watchdog verdict,
    the evidence packet, and the item's content play no part. -/
theorem decideREST_result_char {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) {c : String} {cq : Queue} {d : Decision} :
    (decideREST s qid c cq d).2 =
      if it.queue ≠ cq then .notFound
      else if it.status ≠ .pending then .alreadyDecided
      else .ok := by
  by_cases hq : it.queue = cq
  · by_cases hst : it.status = .pending
    · simp [decideREST, hf, hq, hst]
    · simp [decideREST, hf, hq, hst]
  · simp [decideREST, hf, hq]

theorem decideMCP_result_char {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) {c : String} {d : Decision} :
    (decideMCP s qid c d).2 =
      if it.status ≠ .pending then .alreadyDecided else .ok := by
  by_cases hst : it.status = .pending
  · simp [decideMCP, hf, hst]
  · simp [decideMCP, hf, hst]

theorem decideREST_fst_cases {s : Store} {qid : Nat} {c : String}
    {cq : Queue} {d : Decision} :
    (decideREST s qid c cq d).1 = s ∨
    (decideREST s qid c cq d).1 = applyDecision s qid c d := by
  cases hf : findItem s qid with
  | none => exact Or.inl (by simp [decideREST, hf])
  | some it =>
    by_cases hq : it.queue = cq
    · by_cases hst : it.status = .pending
      · exact Or.inr (by simp [decideREST, hf, hq, hst])
      · exact Or.inl (by simp [decideREST, hf, hq, hst])
    · exact Or.inl (by simp [decideREST, hf, hq])

theorem decideMCP_fst_cases {s : Store} {qid : Nat} {c : String}
    {d : Decision} :
    (decideMCP s qid c d).1 = s ∨
    (decideMCP s qid c d).1 = applyDecision s qid c d := by
  cases hf : findItem s qid with
  | none => exact Or.inl (by simp [decideMCP, hf])
  | some it =>
    by_cases hst : it.status = .pending
    · exact Or.inr (by simp [decideMCP, hf, hst])
    · exact Or.inl (by simp [decideMCP, hf, hst])

/-- A decided item is a no-op for both decide paths: the stored row —
    hence the recorded decision and decider — cannot be changed by
    re-deciding. This is the CAS (`WHERE status = 'pending'`) doing
    its job. -/
theorem decideREST_noop_of_decided {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) (hst : it.status ≠ .pending)
    {c : String} {cq : Queue} {d : Decision} :
    (decideREST s qid c cq d).1 = s := by
  rcases decideREST_fst_cases (s := s) (qid := qid) (c := c) (cq := cq) (d := d) with h | h
  · exact h
  · rw [h]; exact applyDecision_not_pending hf hst

theorem decideMCP_noop_of_decided {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) (hst : it.status ≠ .pending)
    {c : String} {d : Decision} :
    (decideMCP s qid c d).1 = s := by
  rcases decideMCP_fst_cases (s := s) (qid := qid) (c := c) (d := d) with h | h
  · exact h
  · rw [h]; exact applyDecision_not_pending hf hst

/-- The ONLY identity condition on the REST path: the caller's role
    must equal the item's queue. Nothing else about the caller — in
    particular, no relation to whoever submitted the item — is or can
    be checked (the submitter is never recorded). -/
theorem decideREST_ok_queue {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) {c : String} {cq : Queue} {d : Decision}
    (hok : (decideREST s qid c cq d).2 = .ok) :
    it.queue = cq ∧ it.status = .pending := by
  rw [decideREST_result_char hf] at hok
  by_cases hq : it.queue = cq
  · by_cases hst : it.status = .pending
    · exact ⟨hq, hst⟩
    · rw [if_neg (not_not_intro hq), if_pos hst] at hok
      simp at hok
  · rw [if_pos hq] at hok
    simp at hok

/-- On the MCP path, EVERY caller string decides a pending item, and
    the string is recorded verbatim as `decidedBy`. There is no
    authentication to state a theorem about — the identity recorded
    in the audit trail is self-asserted. -/
theorem decideMCP_any_caller {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) (hst : it.status = .pending)
    (c : String) {d : Decision} :
    (decideMCP s qid c d).2 = .ok ∧
    findItem (decideMCP s qid c d).1 qid =
      some { it with status := d.toStatus, decidedBy := some c } := by
  have h1 : decideMCP s qid c d = (applyDecision s qid c d, .ok) := by
    simp [decideMCP, hf, hst]
  constructor
  · rw [h1]
  · rw [h1]
    exact applyDecision_pending hf hst

theorem decideREST_ok_effect {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) (hq : it.queue = cq)
    (hst : it.status = .pending) {c : String} {d : Decision} :
    findItem (decideREST s qid c cq d).1 qid =
      some { it with status := d.toStatus, decidedBy := some c } := by
  have h1 : decideREST s qid c cq d = (applyDecision s qid c d, .ok) := by
    simp [decideREST, hf, hq, hst]
  rw [h1]
  exact applyDecision_pending hf hst

/-! ## 5. Executability (the documented approval boundary)

    No code in the repository executes an approved action; the
    boundary is documentary (evidence packet, governance.rs):
    "Action must stay in the approval queue until an authorized human
    decision is recorded." We take `Executable` to be the precondition
    any external executor must require: the item stands `approved`. -/

def Executable (s : Store) (qid : Nat) : Prop :=
  ∃ it, findItem s qid = some it ∧ it.status = .approved

theorem pending_not_executable {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) (hst : it.status = .pending) :
    ¬ Executable s qid := by
  rintro ⟨it', hf', hst'⟩
  rw [hf] at hf'
  injection hf' with h'
  rw [← h', hst] at hst'
  exact Status.noConfusion hst'

theorem rejected_not_executable {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) (hst : it.status = .rejected) :
    ¬ Executable s qid := by
  rintro ⟨it', hf', hst'⟩
  rw [hf] at hf'
  injection hf' with h'
  rw [← h', hst] at hst'
  exact Status.noConfusion hst'

/-! ## 6. Traces: invariants over arbitrary interleavings

    `Step` allows any sequence of operations through either path
    (including failed decides, which leave the store unchanged).
    `Reachable` is its reflexive-transitive closure. -/

inductive Step : Store → Store → Prop where
  | submitREST {s s' : Store} {sub : String} {cq q : Queue} {nid : Nat}
      {wd : WatchdogDecision}
      (hfst : (submitREST s sub cq q nid wd).1 = s')
      (hok : (submitREST s sub cq q nid wd).2 = .ok) : Step s s'
  | submitMCP {s s' : Store} {q : Queue} {nid : Nat} {wd : WatchdogDecision}
      (hfst : (submitMCP s q nid wd).1 = s')
      (hok : (submitMCP s q nid wd).2 = .ok) : Step s s'
  | decideREST {s s' : Store} {qid : Nat} {c : String} {cq : Queue}
      {d : Decision}
      (hfst : (decideREST s qid c cq d).1 = s') : Step s s'
  | decideMCP {s s' : Store} {qid : Nat} {c : String} {d : Decision}
      (hfst : (decideMCP s qid c d).1 = s') : Step s s'

inductive Reachable : Store → Store → Prop where
  | refl {s : Store} : Reachable s s
  | tail {s₁ s₂ s₃ : Store} : Reachable s₁ s₂ → Step s₂ s₃ → Reachable s₁ s₃

/-- The CAS write touches only the target row, only from `pending`,
    and only in the two decision fields. -/
theorem applyDecision_item_change {s : Store} {qid target : Nat}
    {it it' : Item} {actor : String} {d : Decision}
    (hf : findItem s target = some it)
    (hf' : findItem (applyDecision s qid actor d) target = some it') :
    it' = it ∨
    (it.status = .pending ∧
     it' = { it with status := d.toStatus, decidedBy := some actor }) := by
  cases hf0 : findItem s qid with
  | none =>
    rw [applyDecision_none hf0] at hf'
    rw [hf] at hf'
    injection hf' with hh
    exact Or.inl hh.symm
  | some it₀ =>
    by_cases hst : it₀.status = .pending
    · by_cases hqq : qid = target
      · subst hqq
        rw [hf0] at hf
        injection hf with hh
        subst hh
        refine Or.inr ⟨hst, ?_⟩
        have hp := applyDecision_pending hf0 hst (actor := actor) (d := d)
        rw [hp] at hf'
        injection hf' with hh
        exact hh.symm
      · rw [applyDecision_other (fun hh => hqq hh.symm)] at hf'
        rw [hf] at hf'
        injection hf' with hh
        exact Or.inl hh.symm
    · rw [applyDecision_not_pending hf0 hst] at hf'
      rw [hf] at hf'
      injection hf' with hh
      exact Or.inl hh.symm

theorem applyDecision_findItem_of_decided {s : Store} {qid target : Nat}
    {it : Item} {actor : String} {d : Decision}
    (hf : findItem s target = some it) (hst : it.status ≠ .pending) :
    findItem (applyDecision s qid actor d) target = some it := by
  by_cases hqq : qid = target
  · subst hqq
    rw [applyDecision_not_pending hf hst]
    exact hf
  · rw [applyDecision_other (fun hh => hqq hh.symm)]
    exact hf

theorem applyDecision_findItem_none {s : Store} {qid target : Nat}
    {actor : String} {d : Decision}
    (h : findItem s target = none) :
    findItem (applyDecision s qid actor d) target = none := by
  cases hf : findItem s qid with
  | none => rw [applyDecision_none hf]; exact h
  | some it₀ =>
    by_cases hst : it₀.status = .pending
    · by_cases hqq : qid = target
      · subst hqq
        rw [hf] at h
        simp at h
      · rw [applyDecision_other (fun hh => hqq hh.symm)]
        exact h
    · rw [applyDecision_not_pending hf hst]
      exact h

theorem applyDecision_findItem_exists {s : Store} {qid target : Nat}
    {actor : String} {d : Decision}
    (h : ∃ it, findItem s target = some it) :
    ∃ it, findItem (applyDecision s qid actor d) target = some it := by
  obtain ⟨it, hf⟩ := h
  cases hf0 : findItem s qid with
  | none => exact ⟨it, by rw [applyDecision_none hf0]; exact hf⟩
  | some it₀ =>
    by_cases hst : it₀.status = .pending
    · by_cases hqq : qid = target
      · subst hqq
        exact ⟨_, applyDecision_pending hf0 hst⟩
      · exact ⟨it, by rw [applyDecision_other (fun hh => hqq hh.symm)]; exact hf⟩
    · exact ⟨it, by rw [applyDecision_not_pending hf0 hst]; exact hf⟩

theorem decide_findItem_of_decided {s s' : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) (hst : it.status ≠ .pending)
    (hstep : Step s s') : findItem s' qid = some it := by
  cases hstep with
  | submitREST hfst hok =>
    rw [← hfst]
    exact submitREST_preserves hok hf
  | submitMCP hfst hok =>
    rw [← hfst]
    exact submitMCP_preserves hok hf
  | decideREST hfst =>
    rw [← hfst]
    rcases decideREST_fst_cases with h | h
    · rw [h]; exact hf
    · rw [h]; exact applyDecision_findItem_of_decided hf hst
  | decideMCP hfst =>
    rw [← hfst]
    rcases decideMCP_fst_cases with h | h
    · rw [h]; exact hf
    · rw [h]; exact applyDecision_findItem_of_decided hf hst

/-- **Decided at most once, forever.** Once a row is decided, its
    entire record — status and decider — is frozen in every reachable
    continuation, under arbitrary interleavings of both write paths.
    No re-decision, no un-deciding, no flipping approved ↔ rejected. -/
theorem reachable_decided_forever {s s' : Store} (hr : Reachable s s')
    {qid : Nat} {it : Item} (hf : findItem s qid = some it)
    (hst : it.status ≠ .pending) : findItem s' qid = some it := by
  induction hr with
  | refl => exact hf
  | tail _ hstep ih => exact decide_findItem_of_decided ih hst hstep

/-- A rejected item stays rejected — and therefore non-executable —
    in every reachable continuation. -/
theorem reachable_rejected_forever {s s' : Store} (hr : Reachable s s')
    {qid : Nat} {it : Item} (hf : findItem s qid = some it)
    (hst : it.status = .rejected) : ¬ Executable s' qid := by
  have hne : it.status ≠ .pending := by simp [hst]
  have hf' := reachable_decided_forever hr hf hne
  exact rejected_not_executable hf' hst

/-- Items are born pending: a row that appears during a trace starts
    undecided, whichever path created it. -/
theorem step_born_pending {s s' : Store} (hstep : Step s s') {qid : Nat}
    (hnew : findItem s qid = none) {it' : Item}
    (hf' : findItem s' qid = some it') : it'.status = .pending := by
  cases hstep with
  | submitREST hfst hok =>
    have hf1 : findItem (submitREST _ _ _ _ _ _).1 qid = some it' := hfst ▸ hf'
    rw [submitREST_ok_fst hok, findItem_cons] at hf1
    split at hf1
    · injection hf1 with hh
      exact congrArg Item.status hh.symm
    · rw [hf1] at hnew
      simp at hnew
  | submitMCP hfst hok =>
    have hf1 : findItem (submitMCP _ _ _ _).1 qid = some it' := hfst ▸ hf'
    rw [(submitMCP_ok_fst hok).1, findItem_cons] at hf1
    split at hf1
    · injection hf1 with hh
      exact congrArg Item.status hh.symm
    · rw [hf1] at hnew
      simp at hnew
  | decideREST hfst =>
    have hf1 : findItem (decideREST _ _ _ _ _).1 qid = some it' := hfst ▸ hf'
    rcases decideREST_fst_cases with h | h
    · rw [h] at hf1
      rw [hf1] at hnew
      simp at hnew
    · rw [h] at hf1
      rw [applyDecision_findItem_none hnew] at hf1
      simp at hf1
  | decideMCP hfst =>
    have hf1 : findItem (decideMCP _ _ _ _).1 qid = some it' := hfst ▸ hf'
    rcases decideMCP_fst_cases with h | h
    · rw [h] at hf1
      rw [hf1] at hnew
      simp at hnew
    · rw [h] at hf1
      rw [applyDecision_findItem_none hnew] at hf1
      simp at hf1

/-- No row is ever lost: presence is preserved by every step. -/
theorem step_no_loss {s s' : Store} (hstep : Step s s') {qid : Nat}
    (h : ∃ it, findItem s qid = some it) :
    ∃ it, findItem s' qid = some it := by
  obtain ⟨it, hf⟩ := h
  cases hstep with
  | submitREST hfst hok =>
    rw [← hfst]
    exact ⟨it, submitREST_preserves hok hf⟩
  | submitMCP hfst hok =>
    rw [← hfst]
    exact ⟨it, submitMCP_preserves hok hf⟩
  | decideREST hfst =>
    rw [← hfst]
    rcases decideREST_fst_cases with h' | h'
    · rw [h']; exact ⟨it, hf⟩
    · rw [h']; exact applyDecision_findItem_exists ⟨it, hf⟩
  | decideMCP hfst =>
    rw [← hfst]
    rcases decideMCP_fst_cases with h' | h'
    · rw [h']; exact ⟨it, hf⟩
    · rw [h']; exact applyDecision_findItem_exists ⟨it, hf⟩

theorem reachable_no_loss {s s' : Store} (hr : Reachable s s') {qid : Nat}
    (h : ∃ it, findItem s qid = some it) :
    ∃ it, findItem s' qid = some it := by
  induction hr with
  | refl => exact h
  | tail _ hstep ih => exact step_no_loss hstep ih

/-- Ids stay unique: submission is the only step that adds a row, and
    it adds a fresh id; decisions rewrite a row in place. -/
theorem findItem_ne_none_of_mem_ids {s : Store} {qid : Nat}
    (h : qid ∈ s.map Item.id) : findItem s qid ≠ none := by
  induction s with
  | nil => simp at h
  | cons a rest ih =>
    rw [List.map_cons, List.mem_cons] at h
    rw [findItem_cons]
    cases h with
    | inl hh =>
      rw [if_pos hh.symm]
      simp
    | inr hm =>
      by_cases ha : a.id = qid
      · rw [if_pos ha]
        simp
      · rw [if_neg ha]
        exact ih hm

theorem step_nodup {s s' : Store} (hstep : Step s s')
    (hn : List.Nodup (s.map Item.id)) : List.Nodup (s'.map Item.id) := by
  cases hstep with
  | submitREST hfst hok =>
    have hfresh := (submitREST_ok_fresh hok).1
    rw [← hfst, submitREST_ok_fst hok, List.map_cons]
    refine List.nodup_cons.mpr ⟨?_, hn⟩
    intro hm
    exact findItem_ne_none_of_mem_ids hm hfresh
  | submitMCP hfst hok =>
    have hfresh := (submitMCP_ok_fst hok).2
    rw [← hfst, (submitMCP_ok_fst hok).1, List.map_cons]
    refine List.nodup_cons.mpr ⟨?_, hn⟩
    intro hm
    exact findItem_ne_none_of_mem_ids hm hfresh
  | decideREST hfst =>
    rw [← hfst]
    rcases decideREST_fst_cases with h | h
    · rw [h]; exact hn
    · rw [h, applyDecision_map_id]; exact hn
  | decideMCP hfst =>
    rw [← hfst]
    rcases decideMCP_fst_cases with h | h
    · rw [h]; exact hn
    · rw [h, applyDecision_map_id]; exact hn

theorem reachable_nodup {s s' : Store} (hr : Reachable s s')
    (hn : List.Nodup (s.map Item.id)) : List.Nodup (s'.map Item.id) := by
  induction hr with
  | refl => exact hn
  | tail _ hstep ih => exact step_nodup hstep ih

/-! ## 7. The REST race: one status write, two decision records

    The model above treats each decide as atomic. The REST route is
    NOT atomic: it SELECTs the row (ll. 35–39), checks `pending` in
    TypeScript (ll. 44–45), then issues the CAS update (ll. 49–56).
    A 0-row update is not an error in PostgREST, and the route never
    inspects how many rows its update touched — it proceeds to the
    activity-history insert, the agent-action-log insert and the
    Slack notification (ll. 57–105) regardless. `decideRESTRace`
    models the handler faithfully with an explicit snapshot store
    (what the SELECT saw) distinct from the store at update time. -/

inductive Effect where
  | statusWritten (qid : Nat) (st : Status)
  | decisionLogged (qid : Nat) (st : Status)
  deriving DecidableEq, Repr

/-- The CAS update alone: writes iff the CURRENT row is still
    pending; returns whether a row was written. -/
def casWrite (s : Store) (qid : Nat) (actor : String) (d : Decision) :
    Store × Bool :=
  match findItem s qid with
  | some it =>
    if it.status = .pending then
      (setItem s qid { it with status := d.toStatus, decidedBy := some actor }, true)
    else (s, false)
  | none => (s, false)

/-- The REST decide handler as written, with the snapshot race made
    explicit. Effects model the route's observable side effects: the
    status write (at most one, via the CAS) and the decision log
    entries (emitted whenever the snapshot check passed). -/
def decideRESTRace (sSnap sNow : Store) (qid : Nat) (actor : String)
    (callerQueue : Queue) (d : Decision) :
    Store × List Effect × OpResult :=
  match findItem sSnap qid with
  | none => (sNow, [], .notFound)
  | some snap =>
    if snap.queue ≠ callerQueue then (sNow, [], .notFound)
    else if snap.status ≠ .pending then (sNow, [], .alreadyDecided)
    else
      let w := casWrite sNow qid actor d
      (w.1, (if w.2 then [Effect.statusWritten qid d.toStatus] else [])
        ++ [Effect.decisionLogged qid d.toStatus], .ok)

def raceItem : Item :=
  { id := 1, queue := .finance, watchdog := .approvalRequired,
    status := .pending, decidedBy := none }

/-- **Counterexample (machine-checked).** Alice approves item 1;
    Bob's request, whose SELECT ran before Alice's write landed,
    then "rejects" it. Final state: exactly one status write
    (Alice's approval — the CAS works), BOTH handlers return ok,
    and Bob's handler still emits a *rejected* decision-log effect
    for an item that stands approved. The audit trail now contains
    two contradictory decision records for one decision. -/
theorem race_double_decision_log :
    let s0 : Store := [raceItem]
    let rA := decideRESTRace s0 s0 1 "alice" .finance .approve
    let rB := decideRESTRace s0 rA.1 1 "bob" .finance .reject
    rA.2.2 = .ok ∧ rB.2.2 = .ok ∧
    findItem rB.1 1 =
      some { raceItem with status := .approved, decidedBy := some "alice" } ∧
    rB.2.1 = [Effect.decisionLogged 1 .rejected] ∧
    Effect.decisionLogged 1 .rejected ∈ rA.2.1 ++ rB.2.1 ∧
    Effect.statusWritten 1 .approved ∈ rA.2.1 ∧
    Effect.statusWritten 1 .rejected ∉ rA.2.1 ++ rB.2.1 := by
  decide

/-! ## 8. Exhibits (machine-checked by `decide`) -/

/-- A watchdog-BLOCKED action, submitted via REST and then approved
    via REST **by the same person who submitted it**. Nothing in
    either path consults the watchdog verdict, and the schema records
    no submitter who could be excluded from deciding. -/
example :
    let s1 := (submitREST [] "alice" .finance .finance 7 .blocked).1
    (decideREST s1 7 "alice" .finance .approve).2 = .ok ∧
    findItem (decideREST s1 7 "alice" .finance .approve).1 7 =
      some { id := 7, queue := .finance, watchdog := .blocked,
             status := .approved, decidedBy := some "alice" } := by
  decide

/-- On the MCP path the proposing agent can approve its own proposal,
    and the audit identity is arbitrary: the same pending item is
    decidable under ANY caller string, each recorded verbatim. -/
example :
    let s1 := (submitMCP [] .operations 9 .pass).1
    (decideMCP s1 9 "Sniper Agent" .approve).2 = .ok ∧
    findItem (decideMCP s1 9 "Sniper Agent" .approve).1 9 =
      some { id := 9, queue := .operations, watchdog := .pass,
             status := .approved, decidedBy := some "Sniper Agent" } ∧
    findItem (decideMCP s1 9 "CFO" .approve).1 9 =
      some { id := 9, queue := .operations, watchdog := .pass,
             status := .approved, decidedBy := some "CFO" } := by
  decide

/-- The one REST identity check that exists: a caller whose role is
    the other queue gets a 404 and changes nothing. -/
example :
    let s1 := (submitREST [] "alice" .finance .finance 7 .pass).1
    (decideREST s1 7 "mallory" .operations .approve).2 = .notFound ∧
    (decideREST s1 7 "mallory" .operations .approve).1 = s1 := by
  decide

/-! ## 9. The database layer bypasses everything above

    Migration 0001's RLS policy `approval_items_update_same_queue`
    lets any authenticated user UPDATE any row in their own queue —
    no `WITH CHECK`, no column restriction, no status restriction.
    PostgREST exposes the table directly, so this path skips the API
    routes (and their pending check) entirely. It is NOT part of
    `Step` above: the trace invariants hold for the API/MCP paths and
    fail here, in a single update. -/

/-- The raw table update the RLS policy permits: a same-queue caller
    rewrites `status` and `decided_by` to ANY values. No pending
    check, no CAS, no watchdog involvement. -/
def rlsUpdate (s : Store) (qid : Nat) (callerQueue : Queue)
    (newStatus : Status) (newDecidedBy : Option String) :
    Store × OpResult :=
  match findItem s qid with
  | none => (s, .notFound)
  | some it =>
    if it.queue ≠ callerQueue then (s, .notFound)
    else (setItem s qid
      { it with status := newStatus, decidedBy := newDecidedBy }, .ok)

theorem rlsUpdate_result_char {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) {cq : Queue} {st : Status}
    {nb : Option String} :
    (rlsUpdate s qid cq st nb).2 =
      if it.queue ≠ cq then .notFound else .ok := by
  by_cases hq : it.queue = cq <;> simp [rlsUpdate, hf, hq]

theorem rlsUpdate_ok_effect {s : Store} {qid : Nat} {it : Item}
    (hf : findItem s qid = some it) {cq : Queue} (hq : it.queue = cq)
    {st : Status} {nb : Option String} :
    findItem (rlsUpdate s qid cq st nb).1 qid =
      some { it with status := st, decidedBy := nb } := by
  have h1 : (rlsUpdate s qid cq st nb).1 =
      setItem s qid { it with status := st, decidedBy := nb } := by
    simp [rlsUpdate, hf, hq]
  rw [h1]
  exact findItem_setItem_same (it := it) (findItem_id (it := it) hf) hf

/-- **The API-layer invariant `reachable_rejected_forever` is false
    at the database layer.** A rejected row becomes approved —
    `Executable` — in one raw update by any same-queue caller, who
    also chooses the recorded "decider". -/
theorem rlsUpdate_rejected_to_executable {s : Store} {qid : Nat}
    {it : Item} (hf : findItem s qid = some it) {cq : Queue}
    (hq : it.queue = cq) {nb : Option String} :
    (rlsUpdate s qid cq .approved nb).2 = .ok ∧
    Executable (rlsUpdate s qid cq .approved nb).1 qid := by
  constructor
  · rw [rlsUpdate_result_char hf]
    exact if_neg (not_not_intro hq)
  · exact ⟨{ it with status := .approved, decidedBy := nb },
      rlsUpdate_ok_effect hf hq, rfl⟩

/-- Exhibit: a rejected, watchdog-BLOCKED item flipped straight to
    approved at the database layer, its audit field overwritten to
    credit a "decider" who never ran a decision operation. -/
example :
    let s0 : Store := [{ id := 3, queue := .finance, watchdog := .blocked,
                         status := .rejected, decidedBy := some "CFO" }]
    (rlsUpdate s0 3 .finance .approved (some "mallory")).2 = .ok ∧
    findItem (rlsUpdate s0 3 .finance .approved (some "mallory")).1 3 =
      some { id := 3, queue := .finance, watchdog := .blocked,
             status := .approved, decidedBy := some "mallory" } := by
  decide

/-! ## 10. The watchdog verdict is not an input to any decision

    Corollaries of the result characterizations: the result of a
    decide depends on the target row only through its queue (REST)
    and its status. The stored watchdog decision — pass,
    approval-required or blocked — is never consulted. -/

theorem decideREST_result_watchdog_free {it₁ it₂ : Item}
    (hid : it₂.id = it₁.id) (hq : it₂.queue = it₁.queue)
    (hst : it₂.status = it₁.status)
    {c : String} {cq : Queue} {d : Decision} :
    (decideREST [it₂] it₁.id c cq d).2 =
    (decideREST [it₁] it₁.id c cq d).2 := by
  have h1 : findItem [it₁] it₁.id = some it₁ := by
    rw [findItem_cons]; exact if_pos rfl
  have h2 : findItem [it₂] it₁.id = some it₂ := by
    rw [findItem_cons]; exact if_pos hid
  rw [decideREST_result_char h2, decideREST_result_char h1, ← hq, ← hst]

theorem decideMCP_result_watchdog_free {it₁ it₂ : Item}
    (hid : it₂.id = it₁.id) (hst : it₂.status = it₁.status)
    {c : String} {d : Decision} :
    (decideMCP [it₂] it₁.id c d).2 = (decideMCP [it₁] it₁.id c d).2 := by
  have h1 : findItem [it₁] it₁.id = some it₁ := by
    rw [findItem_cons]; exact if_pos rfl
  have h2 : findItem [it₂] it₁.id = some it₂ := by
    rw [findItem_cons]; exact if_pos hid
  rw [decideMCP_result_char h2, decideMCP_result_char h1, ← hst]

/-! ## 11. Axiom audit

    Every headline result must depend only on Lean's core axioms
    (`propext`, `Classical.choice`, `Quot.sound`) — no `sorry`, no
    custom axioms. -/

#print axioms assess_blocked_iff
#print axioms decideREST_ok_queue
#print axioms decideMCP_any_caller
#print axioms submitREST_creates_pending
#print axioms reachable_decided_forever
#print axioms reachable_rejected_forever
#print axioms reachable_no_loss
#print axioms reachable_nodup
#print axioms rlsUpdate_rejected_to_executable
#print axioms race_double_decision_log

end MetaboCommand
