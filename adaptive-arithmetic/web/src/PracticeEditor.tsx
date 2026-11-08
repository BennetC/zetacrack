import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FiCopy, FiInfo, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import {
  basisPoints,
  builtins,
  configsEqual,
  effectiveShare,
  GENERATOR_VERSION,
  newGroup,
  OPERATIONS,
  POLICY_VERSION,
  QuestionGenerator,
  splitEqually,
  TITLES,
  validateConfig,
  type Config,
  type Group,
  type NumberRange,
  type Operation,
  type Preset,
} from "./domain";
import { loadSetup, request } from "./api";
import { PracticeRun, type Runtime } from "./PracticeRun";
import { ExportActions } from "./ExportActions";
import { MEASUREMENT_VERSION, type SavedSession } from "./measurements";
import {
  StandardGenerator,
  standardConfig,
  STANDARD_GENERATOR_VERSION,
  STANDARD_POLICY_VERSION,
  STANDARD_CONTENT_VERSION,
  CUSTOM_CONTENT_VERSION,
} from "./standard";
import { HistoryView, GraphsView } from "./SavedViews";
import { updateLocation, useLocationParams } from "./navigation";
import {
  rememberCreation,
  forgetCreation,
  type CreationRequest,
} from "./sessionCreation";
import {
  consumeReloadRestart,
  clearReloadRestart,
  type ReloadRestart,
} from "./reloadRestart";
import {
  acquireSessionOwnership,
  recoverPending,
  interruptedEnd,
  JOURNAL_PREFIX,
  watchStartFocus,
  type SessionOwnership,
  type StartFocusGuard,
} from "./sessionRecovery";

function ErrorText({ children, id }: { children?: string; id?: string }) {
  return children ? (
    <p className="field-error" role="alert" id={id}>
      {children}
    </p>
  ) : null;
}
function Percent({
  value,
  onChange,
  label,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  error?: string;
}) {
  return (
    <div>
      <div className="percent-field">
        <input
          inputMode="decimal"
          aria-label={label}
          aria-invalid={Boolean(error)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span>%</span>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
function RangeFields({
  range,
  onChange,
  label,
  identity,
  error,
}: {
  range: NumberRange;
  onChange: (range: NumberRange) => void;
  label: string;
  identity: string;
  error?: string;
}) {
  return (
    <div className="range-fields">
      <span className="mobile-caption">{label}</span>
      <div className="range-inputs">
        <label htmlFor={identity + "-min"}>
          From
          <input
            id={identity + "-min"}
            aria-label={label + " minimum"}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? identity + "-error" : undefined}
            inputMode="decimal"
            value={range.min}
            onChange={(e) => onChange({ ...range, min: e.target.value })}
          />
        </label>
        <label htmlFor={identity + "-max"}>
          To
          <input
            id={identity + "-max"}
            aria-label={label + " maximum"}
            aria-invalid={Boolean(error)}
            inputMode="decimal"
            value={range.max}
            onChange={(e) => onChange({ ...range, max: e.target.value })}
          />
        </label>
        <label htmlFor={identity + "-places"}>
          Decimal places
          <select
            id={identity + "-places"}
            aria-label={label + " decimal places"}
            value={range.decimalPlaces}
            onChange={(e) =>
              onChange({ ...range, decimalPlaces: Number(e.target.value) })
            }
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <ErrorText id={identity + "-error"}>{error}</ErrorText>
    </div>
  );
}
function NameDialog({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a preset name.");
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog ref={dialog} onCancel={onClose} className="preset-dialog">
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <FiX />
          </button>
        </div>
        <label>
          Preset name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function App() {
  const params = useLocationParams();
  const view = params.get("view") || "standard";
  const detailId = params.get("session");
  const returnTo = params.get("returnTo") === "graphs" ? "graphs" : "history";
  const navigate = (next: string) => {
    updateLocation({ view: next, session: null, returnTo: null });
  };
  const openDetail = (id: string | null, source = view) => {
    if (id)
      updateLocation({
        view: "history",
        session: id,
        returnTo: source === "graphs" ? "graphs" : "history",
      });
    else updateLocation({ view: returnTo, session: null, returnTo: null });
  };
  const defaults = useMemo(builtins, []);
  const [config, setConfigState] = useState<Config>(() =>
    structuredClone(defaults[0].config),
  );
  const editedCustom = useRef(false);
  const setConfig = (update: Config | ((current: Config) => Config)) => {
    editedCustom.current = true;
    setConfigState(update);
  };
  const [presets, setPresets] = useState<Preset[]>([]),
    [selectedPreset, setSelectedPreset] = useState("builtin-0");
  const [active, setActive] = useState<Operation>("addition"),
    [adding, setAdding] = useState(false);
  const [ready, setReady] = useState(false),
    [setupAttempt, setSetupAttempt] = useState(0),
    [notice, setNotice] = useState(""),
    [apiError, setApiError] = useState(""),
    [recoveryError, setRecoveryError] = useState("");
  const [dialog, setDialog] = useState<"save" | "rename" | null>(null),
    [busy, setBusy] = useState(false),
    [runtime, setRuntime] = useState<Runtime | null>(null);
  const [restartError, setRestartError] = useState("");
  const [startError, setStartError] = useState("");
  const pendingCreation = useRef<CreationRequest | null>(null);
  useEffect(() => {
    const selection = (event: Event) => {
      if (starting.current || runtime) return;
      const next = (event as CustomEvent<Config>).detail;
      if (Object.keys(validateConfig(next)).length) return;
      setConfig(structuredClone(next));
      setActive(next.operations[0].id);
      setSelectedPreset("");
      setNotice(
        "Custom practice created from your selected questions. Review the groups and settings before starting.",
      );
      navigate("custom");
    };
    const challenge = (event: Event) => {
      if (starting.current || runtime) return;
      const source = (event as CustomEvent<SavedSession>).detail;
      navigate(source.mode === "standard" ? "standard" : "custom");
      void start(source.mode === "standard", source.config, {
        seed: source.seed,
        replayOf: source.id,
      });
    };
    window.addEventListener("arithmetic:practice-selection", selection);
    window.addEventListener("arithmetic:seed-challenge", challenge);
    return () => {
      window.removeEventListener("arithmetic:practice-selection", selection);
      window.removeEventListener("arithmetic:seed-challenge", challenge);
    };
  });
  const creationOwnership = useRef<SessionOwnership | null>(null);
  const restartIntent = useRef<ReloadRestart | null>(null),
    restartChecked = useRef(false),
    restartOwnershipCheck = useRef<Promise<void>>(Promise.resolve()),
    starting = useRef(false);
  const lastQueue = useRef(Promise.resolve()),
    generation = useRef(0),
    recovery = useRef<Promise<string[]> | null>(null),
    appMounted = useRef(false),
    pendingStart = useRef<StartFocusGuard | null>(null);
  useEffect(() => {
    appMounted.current = true;
    return () => {
      appMounted.current = false;
      queueMicrotask(() => {
        if (!appMounted.current) {
          pendingStart.current?.dispose();
          if (!starting.current) creationOwnership.current?.release();
        }
      });
    };
  }, []);
  useEffect(() => {
    if (!runtime) return;
    const back = () => leaveRun();
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [runtime]);
  useEffect(() => {
    if (restartChecked.current) return;
    restartChecked.current = true;
    try {
      restartIntent.current = consumeReloadRestart(view);
      if (restartIntent.current) {
        // A duplicated tab may inherit sessionStorage. The previous document
        // must have released ownership before its candidate can restart here.
        const candidate = restartIntent.current;
        restartOwnershipCheck.current = (async () => {
          try {
            const ownership = await acquireSessionOwnership(
              candidate.sessionId,
            );
            if (!ownership) {
              restartIntent.current = null;
              setRestartError(
                "The previous run is still owned by another tab. Start a run from setup.",
              );
              return;
            }
            await ownership.release();
            void restartRun();
          } catch (e) {
            setRestartError(
              `Automatic restart could not check session ownership. ${(e as Error).message}`,
            );
          }
        })();
      }
    } catch {
      setRestartError(
        "Automatic restart is unavailable because this tab’s restart information could not be read. Start a run from setup.",
      );
    }
  }, []);
  useEffect(() => {
    if (["history", "graphs"].includes(view)) return;
    let live = true;
    // Wait only on the quick prior-owner check, so recovery cannot take that
    // lock first. Replacement creation never waits for journal recovery.
    recovery.current ||= restartOwnershipCheck.current.then(() =>
      recoverPending(),
    );
    void recovery.current.then((errors) => {
      if (live) setRecoveryError(errors.join(" "));
    });
    return () => {
      live = false;
    };
  }, [view]);
  async function retryRecovery() {
    recovery.current = recoverPending();
    setRecoveryError((await recovery.current).join(" "));
  }
  const errors = validateConfig(config),
    valid = Object.keys(errors).length === 0;
  const operation = config.operations.find((o) => o.id === active);
  const userPreset = presets.find((p) => p.id === selectedPreset);
  const chosen = [...defaults, ...presets].find((p) => p.id === selectedPreset);
  const modified = chosen && !configsEqual(chosen.config, config);
  useEffect(() => {
    let live = true;
    loadSetup()
      .then((data) => {
        if (!live) return;
        setPresets(data.presets);
        // Initial reads may finish after deliberate edits (including a retry).
        // Load presets, but preserve the user's newer in-memory custom setup.
        if (data.lastConfig && !editedCustom.current) {
          setConfigState(data.lastConfig);
          setActive(data.lastConfig.operations[0]?.id || "addition");
          setSelectedPreset(
            [...defaults, ...data.presets].find((p) =>
              configsEqual(p.config, data.lastConfig!),
            )?.id || "",
          );
        }
        setApiError("");
        setReady(true);
      })
      .catch((e) => {
        if (live)
          setApiError("The local database is unavailable. " + e.message);
      });
    return () => {
      live = false;
    };
  }, [defaults, setupAttempt]);
  useEffect(() => {
    if (!ready || !valid || !editedCustom.current) return;
    const revision = ++generation.current;
    const snapshot = structuredClone(config);
    const timer = setTimeout(() => {
      lastQueue.current = lastQueue.current
        .catch(() => {})
        .then(async () => {
          try {
            await request("/api/last-config", "PUT", snapshot);
            if (revision === generation.current) {
              setNotice((current) => current || "Setup remembered");
              setApiError("");
            }
          } catch (e) {
            setApiError(
              "Your latest setup could not be saved. " + (e as Error).message,
            );
          }
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [config, ready, valid]);
  function editGroup(id: string, change: Partial<Group>) {
    setConfig((c) => ({
      ...c,
      operations: c.operations.map((op) => ({
        ...op,
        groups: op.groups.map((g) => (g.id === id ? { ...g, ...change } : g)),
      })),
    }));
    setNotice("");
  }
  function editOperation(id: Operation, share: string) {
    setConfig((c) => ({
      ...c,
      operations: c.operations.map((op) =>
        op.id === id ? { ...op, share } : op,
      ),
    }));
  }
  function choosePreset(id: string) {
    const preset = [...defaults, ...presets].find((p) => p.id === id);
    if (!preset) return;
    setConfig(structuredClone(preset.config));
    setSelectedPreset(id);
    setActive(preset.config.operations[0]?.id || "addition");
    setNotice("");
  }
  function addOperation(id: Operation) {
    setConfig((c) => ({
      ...c,
      operations: [
        ...c.operations,
        {
          id,
          version: 1,
          share: c.operations.length ? "0" : "100",
          groups: [newGroup(id, true)],
        },
      ],
    }));
    setActive(id);
    setAdding(false);
  }
  function addGroup() {
    if (!operation) return;
    setConfig((c) => ({
      ...c,
      operations: c.operations.map((op) =>
        op.id === active
          ? {
              ...op,
              groups: [...op.groups, newGroup(active, !op.groups.length)],
            }
          : op,
      ),
    }));
  }
  function duplicate(group: Group) {
    setConfig((c) => ({
      ...c,
      operations: c.operations.map((op) =>
        op.id === active
          ? {
              ...op,
              groups: [
                ...op.groups,
                {
                  ...structuredClone(group),
                  id: crypto.randomUUID(),
                  name: group.name + " copy",
                  share: "0",
                },
              ],
            }
          : op,
      ),
    }));
  }
  function removeGroup(id: string) {
    setConfig((c) => ({
      ...c,
      operations: c.operations.map((op) => ({
        ...op,
        groups: op.groups.filter((g) => g.id !== id),
      })),
    }));
  }
  function removeOperation() {
    const remaining = config.operations.filter((op) => op.id !== active);
    setConfig({ ...config, operations: remaining });
    setActive(remaining[0]?.id || "addition");
  }
  function splitOperations() {
    const shares = splitEqually(config.operations.length);
    setConfig((c) => ({
      ...c,
      operations: c.operations.map((op, i) => ({ ...op, share: shares[i] })),
    }));
  }
  function splitGroups() {
    if (!operation) return;
    const shares = splitEqually(operation.groups.length);
    setConfig((c) => ({
      ...c,
      operations: c.operations.map((op) =>
        op.id === active
          ? {
              ...op,
              groups: op.groups.map((g, i) => ({ ...g, share: shares[i] })),
            }
          : op,
      ),
    }));
  }
  async function save(name: string) {
    const preset = await request<Preset>("/api/presets", "POST", {
      name,
      config,
    });
    setPresets((p) => [...p, preset]);
    setSelectedPreset(preset.id);
    setNotice("Preset saved");
  }
  async function update() {
    if (!userPreset) return;
    setBusy(true);
    try {
      const preset = await request<Preset>(
        "/api/presets/" + userPreset.id,
        "PUT",
        { name: userPreset.name, config },
      );
      setPresets((p) =>
        p.map((item) => (item.id === preset.id ? preset : item)),
      );
      setNotice("Preset updated");
      setApiError("");
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function rename(name: string) {
    if (!userPreset) return;
    await request("/api/presets/" + userPreset.id, "PATCH", { name });
    setPresets((p) =>
      p.map((item) => (item.id === userPreset.id ? { ...item, name } : item)),
    );
    setNotice("Preset renamed");
  }
  async function removePreset() {
    if (!userPreset) return;
    setBusy(true);
    try {
      await request("/api/presets/" + userPreset.id, "DELETE");
      setPresets((p) => p.filter((item) => item.id !== userPreset.id));
      setSelectedPreset("");
      setNotice("Preset deleted; session records retained");
      setApiError("");
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restartRun() {
    const intent = restartIntent.current;
    if (!intent) return;
    const snapshot = structuredClone(intent.config);
    snapshot.session.countdown = false;
    setRestartError("");
    const succeeded = await start(
      intent.mode === "standard",
      snapshot,
      intent.replayOf
        ? { replayOf: intent.replayOf, seed: intent.challengeSeed }
        : undefined,
    );
    if (succeeded) restartIntent.current = null;
    else if (appMounted.current)
      setRestartError(
        "The fresh run could not be started. Your previous run’s recovery data is retained.",
      );
  }
  async function start(
    standard = false,
    restartConfig?: Config,
    challenge?: { seed?: string; replayOf: string },
  ) {
    if (
      starting.current ||
      (!pendingCreation.current &&
        !restartConfig &&
        ((!standard && !valid) || busy || !ready))
    )
      return false;
    starting.current = true;
    const startFocus = watchStartFocus();
    pendingStart.current = startFocus;
    let ownership: SessionOwnership | null = null;
    let handedOff = false;
    setBusy(true);
    setStartError("");
    try {
      if (!navigator.locks)
        throw new Error(
          "This browser does not support safe session ownership. Use a browser with Web Locks, such as Chrome.",
        );
      let snapshot = restartConfig
          ? structuredClone(restartConfig)
          : standard
            ? standardConfig()
            : structuredClone(config),
        seed: string = challenge?.seed || crypto.randomUUID();
      if (!pendingCreation.current && !standard && !restartConfig) {
        await lastQueue.current.catch(() => {});
        await request("/api/last-config", "PUT", snapshot);
      }
      if (!pendingCreation.current)
        pendingCreation.current = {
          creationKey: crypto.randomUUID(),
          ...(challenge ? { replayOf: challenge.replayOf } : {}),
          config: snapshot,
          seed,
          generatorVersion: standard
            ? STANDARD_GENERATOR_VERSION
            : GENERATOR_VERSION,
          policyVersion: standard ? STANDARD_POLICY_VERSION : POLICY_VERSION,
          measurementVersion: MEASUREMENT_VERSION,
          mode: standard ? "standard" : "custom",
          contentVersion: standard
            ? STANDARD_CONTENT_VERSION
            : CUSTOM_CONTENT_VERSION,
        };
      const creation = pendingCreation.current;
      if (!creationOwnership.current) {
        creationOwnership.current = await acquireSessionOwnership(
          "creation." + creation.creationKey,
        );
        if (!creationOwnership.current)
          throw new Error("Another page is handling this pending start.");
      }
      rememberCreation(creation);
      snapshot = creation.config;
      seed = creation.seed;
      standard = creation.mode === "standard";
      const session = await request<{ id: string }>(
        "/api/sessions",
        "POST",
        creation,
      );
      ownership = await acquireSessionOwnership(session.id);
      if (!ownership)
        throw new Error("This session is already owned by another page.");
      // Install an empty observation journal before retiring the creation key.
      // A page disappearing before its first render is still recoverable.
      localStorage.setItem(
        JOURNAL_PREFIX + session.id,
        JSON.stringify({ id: session.id, events: [] }),
      );
      forgetCreation(creation);
      pendingCreation.current = null;
      if (!appMounted.current) {
        const event = {
          ...interruptedEnd([]),
          payload: {
            reason: "page-exit",
            wallAt: new Date().toISOString(),
            endTimeKnown: true,
            unfinishedQuestionId: null,
          },
        };
        try {
          localStorage.setItem(
            JOURNAL_PREFIX + session.id,
            JSON.stringify({ id: session.id, events: [event] }),
          );
        } catch {
          /* Still attempt the database write when storage is unavailable. */
        }
        await request("/api/sessions/" + session.id + "/observations", "POST", {
          events: [event],
        });
        localStorage.removeItem(JOURNAL_PREFIX + session.id);
        return;
      }
      const generator = standard
        ? new StandardGenerator(seed)
        : new QuestionGenerator(snapshot, seed);
      setRuntime({
        id: session.id,
        config: snapshot,
        seed,
        generator,
        firstQuestion: generator.next(),
        ownership,
        startFocus,
        mode: standard ? "standard" : "custom",
        replayOf: creation.replayOf,
      });
      handedOff = true;
      setApiError("");
      return true;
    } catch (e) {
      if (appMounted.current) setStartError((e as Error).message);
      return false;
    } finally {
      if (!handedOff) {
        startFocus.dispose();
        ownership?.release();
      }
      pendingStart.current = null;
      starting.current = false;
      if (handedOff || !pendingCreation.current || !appMounted.current) {
        creationOwnership.current?.release();
        creationOwnership.current = null;
      }
      if (appMounted.current) setBusy(false);
    }
  }
  const recoveryNotice = recoveryError && (
    <div className="api-error" role="alert" data-testid="recovery-error">
      <p>{recoveryError}</p>
      <button className="text-button" onClick={() => void retryRecovery()}>
        Retry recovery
      </button>
    </div>
  );
  const startNotice = startError && (
    <div role="alert" className="api-error">
      <p>{startError}</p>
      {pendingCreation.current && (
        <p>
          Retry uses the original settings and start request to avoid creating a
          duplicate run.
        </p>
      )}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void start()}
      >
        Retry starting run
      </button>
    </div>
  );
  function leaveRun() {
    if (runtime) {
      try {
        clearReloadRestart(runtime.id);
      } catch {
        /* A later non-reload visit discards stale intent. */
      }
    }
    setRuntime(null);
  }
  if (runtime)
    return (
      <>
        {recoveryNotice}
        {startNotice}
        <PracticeRun
          key={runtime.id}
          runtime={runtime}
          onBack={leaveRun}
          onAgain={async () => {
            await start(
              runtime.mode === "standard",
              runtime.config,
              runtime.replayOf
                ? { replayOf: runtime.id, seed: runtime.seed }
                : undefined,
            );
          }}
          onInspect={(id) => {
            leaveRun();
            openDetail(id, "history");
          }}
          onGraphs={(cohort, includePartial) => {
            leaveRun();
            navigate("graphs");
            updateLocation(
              { gCohort: cohort, gPartial: includePartial ? "true" : null },
              true,
            );
          }}
        />
      </>
    );
  const navigation = (
    <>
      <nav className="product-nav" aria-label="Practice and saved data">
        {[
          ["standard", "Standard Zetamac"],
          ["custom", "Custom practice"],
          ["history", "History"],
          ["graphs", "Graphs"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={view === id ? "nav-current" : ""}
            aria-current={view === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {startNotice}
      {restartError && (
        <div className="api-error" role="alert">
          <p>{restartError}</p>
          {restartIntent.current && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void restartRun()}
            >
              Retry automatic restart
            </button>
          )}
        </div>
      )}
    </>
  );
  if (view === "history")
    return (
      <>
        {navigation}
        <HistoryView
          detailId={detailId}
          onDetail={openDetail}
          backLabel={
            returnTo === "graphs" ? "Back to graphs" : "Back to history"
          }
        />
      </>
    );
  if (view === "graphs")
    return (
      <>
        {navigation}
        <GraphsView
          onDetail={(id) => {
            openDetail(id, "graphs");
          }}
        />
      </>
    );
  if (view !== "custom")
    return (
      <>
        {navigation}
        <main className="saved-page standard-home">
          <div className="brand">Arithmetic</div>
          <h1>Standard Zetamac</h1>
          <p className="lead">
            Two minutes. Four operations. How many can you solve?
          </p>
          <div className="standard-start">
            <button
              className="primary-button"
              disabled={!ready || busy}
              onClick={() => void start(true)}
            >
              {busy ? "Starting…" : "Start standard run"}
            </button>
            <span>120 seconds · starts immediately</span>
          </div>
          <section className="rules-card">
            <h2>Original default question rules</h2>
            <ul>
              <li>Addition: independent integers from 2 to 100.</li>
              <li>Subtraction: (a + b) − a, using independent 2–100 draws.</li>
              <li>Multiplication: 2–12 × 2–100.</li>
              <li>
                Division: (a × b) ÷ a, using those multiplication factors.
              </li>
            </ul>
            <p>
              Each operation has a 25% chance. Repeats are allowed. Each
              accepted answer adds one to your score; interrupted runs are
              marked partial.
            </p>
            <details>
              <summary>Timing and comparison rules</summary>
              <p>
                Our version uses a monotonic clock from the first React layout
                commit, an exclusive deadline, exact numeric answer equivalence,
                and ends on focus loss. These differ from the original game's
                clock and input behavior, so scores are not externally
                interchangeable. Response times include input and edits; render
                commits do not measure physical screen presentation.
              </p>
              <p>
                Original rules verified from{" "}
                <a
                  href="https://arithmetic.zetamac.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Zetamac
                </a>{" "}
                on 9 October 2026. This is a fixed, nonadaptive mode.
              </p>
            </details>
          </section>
          <p className="section-help">
            Your custom practice setup is remembered separately. Sessions are
            kept locally until you delete them.
          </p>
          <ExportActions />
          {apiError && (
            <p role="alert" className="api-error">
              {apiError}
              <button
                className="text-button"
                onClick={() => setSetupAttempt((n) => n + 1)}
              >
                Retry connection
              </button>
            </p>
          )}
          {recoveryError && (
            <p role="alert" className="api-error">
              {recoveryError}
              <button
                className="text-button"
                onClick={() => void retryRecovery()}
              >
                Retry recovery
              </button>
            </p>
          )}
        </main>
      </>
    );
  const total =
    config.operations.reduce((sum, op) => {
      try {
        return sum + basisPoints(op.share);
      } catch {
        return sum;
      }
    }, 0) / 100;
  return (
    <>
      {navigation}
      <div className="workspace">
        <main className="editor-main">
          <header className="page-header">
            <div className="brand">Arithmetic</div>
            <h1>Custom practice</h1>
            <p>
              Configure your practice set by choosing operations and creating
              exercise groups.
            </p>
          </header>
          {apiError && (
            <div className="api-error" role="alert">
              {apiError}
              {!ready && (
                <button
                  className="text-button"
                  onClick={() => setSetupAttempt((n) => n + 1)}
                >
                  Retry connection
                </button>
              )}
            </div>
          )}
          {recoveryError && (
            <div
              className="api-error"
              role="alert"
              data-testid="recovery-error"
            >
              A previous session needs recovery. {recoveryError}
              <button
                className="text-button"
                onClick={() => void retryRecovery()}
              >
                Retry recovery
              </button>
            </div>
          )}
          <section
            className="operations-section"
            aria-labelledby="operations-heading"
          >
            <h2 id="operations-heading">Operations</h2>
            <p className="section-help">
              Set the overall percentage for each operation. Total must equal
              100%.
            </p>
            <div className="operation-tabs">
              {config.operations.map((op) => (
                <div
                  className={
                    "operation-tab " + (op.id === active ? "selected" : "")
                  }
                  key={op.id}
                >
                  <button
                    className="operation-name"
                    onClick={() => setActive(op.id)}
                    aria-pressed={op.id === active}
                  >
                    {TITLES[op.id]}
                  </button>
                  <Percent
                    label={TITLES[op.id] + " session share"}
                    value={op.share}
                    error={errors["operations." + op.id + ".share"]}
                    onChange={(share) => editOperation(op.id, share)}
                  />
                </div>
              ))}
              {config.operations.length < 4 && (
                <div className="add-operation">
                  <button
                    className="secondary-button"
                    onClick={() => setAdding((v) => !v)}
                    aria-expanded={adding}
                  >
                    <FiPlus /> Add operation
                  </button>
                  {adding && (
                    <div className="operation-menu">
                      {OPERATIONS.filter(
                        (id) => !config.operations.some((op) => op.id === id),
                      ).map((id) => (
                        <button key={id} onClick={() => addOperation(id)}>
                          {TITLES[id]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <output
                className={
                  "operation-total " + (errors.operations ? "invalid" : "")
                }
              >
                Total: <strong>{total}%</strong>
              </output>
            </div>
            <div className="operation-utilities">
              {config.operations.length > 1 && (
                <button className="text-button" onClick={splitOperations}>
                  Split operation shares equally
                </button>
              )}
              <ErrorText>{errors.operations}</ErrorText>
            </div>
          </section>
          {operation ? (
            <section
              className="groups-section"
              aria-labelledby="groups-heading"
            >
              <div className="section-heading">
                <h2 id="groups-heading">{TITLES[active]}</h2>
                <div className="heading-actions">
                  <button className="text-button" onClick={addGroup}>
                    <FiPlus /> Add group
                  </button>
                  <button
                    className="text-button"
                    onClick={splitGroups}
                    disabled={!operation.groups.length}
                  >
                    Split equally
                  </button>
                </div>
              </div>
              <p className="section-help">
                Create groups for this operation. Set the within-operation share
                and the number ranges for each operand.
              </p>
              <ErrorText>
                {errors["operations." + active + ".groups"]}
              </ErrorText>
              <div className="group-grid group-grid-heading" aria-hidden="true">
                <span>Group</span>
                <span>
                  Within-operation
                  <br />
                  share <FiInfo title="Percentage within this operation" />
                </span>
                <span>
                  Effective session
                  <br />
                  share{" "}
                  <FiInfo title="Operation share multiplied by group share" />
                </span>
                <span>
                  {active === "division" ? "Divisor" : "Left operand"}
                </span>
                <span>
                  {active === "division" ? "Answer" : "Right operand"}
                </span>
                <span>Actions</span>
              </div>
              {operation.groups.map((group) => (
                <div
                  className="exercise-row"
                  key={group.id}
                  data-group-id={group.id}
                >
                  <div className="group-grid">
                    <div>
                      <span className="mobile-caption">Group</span>
                      <input
                        className="group-name"
                        aria-label={group.name + " group name"}
                        value={group.name}
                        onChange={(e) =>
                          editGroup(group.id, { name: e.target.value })
                        }
                      />
                      <ErrorText>
                        {errors["groups." + group.id + ".name"] ||
                          errors["groups." + group.id]}
                      </ErrorText>
                    </div>
                    <div>
                      <span className="mobile-caption">
                        Within-operation share
                      </span>
                      <Percent
                        label={group.name + " within-operation share"}
                        value={group.share}
                        error={errors["groups." + group.id + ".share"]}
                        onChange={(share) => editGroup(group.id, { share })}
                      />
                    </div>
                    <div>
                      <span className="mobile-caption">
                        Effective session share
                      </span>
                      <div className="percent-field">
                        <output
                          aria-label={group.name + " effective session share"}
                        >
                          {effectiveShare(operation.share, group.share)}
                        </output>
                        <span>%</span>
                      </div>
                    </div>
                    <RangeFields
                      label={
                        group.name +
                        (active === "division" ? " divisor" : " left operand")
                      }
                      identity={group.id + "-first"}
                      range={group.first}
                      error={errors["groups." + group.id + ".first"]}
                      onChange={(first) => editGroup(group.id, { first })}
                    />
                    <RangeFields
                      label={
                        group.name +
                        (active === "division" ? " answer" : " right operand")
                      }
                      identity={group.id + "-second"}
                      range={group.second}
                      error={errors["groups." + group.id + ".second"]}
                      onChange={(second) => editGroup(group.id, { second })}
                    />
                    <div className="group-actions">
                      <button
                        className="icon-button"
                        title="Duplicate group"
                        aria-label={"Duplicate " + group.name}
                        onClick={() => duplicate(group)}
                      >
                        <FiCopy />
                      </button>
                      <button
                        className="icon-button"
                        title="Remove group"
                        aria-label={"Remove " + group.name}
                        onClick={() => removeGroup(group.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                  {active === "subtraction" && (
                    <label className="negative-option">
                      <input
                        type="checkbox"
                        checked={group.allowNegative}
                        onChange={(e) =>
                          editGroup(group.id, {
                            allowNegative: e.target.checked,
                          })
                        }
                      />
                      Allow negative answers
                    </label>
                  )}
                </div>
              ))}
              {!operation.groups.length && (
                <div className="empty-groups">
                  Add an exercise group to configure this operation.
                </div>
              )}
              <div className="group-footnote">
                <p>
                  {active === "division"
                    ? "The dividend is generated from divisor × answer. Zero divisors are excluded."
                    : "Range endpoints are included. Equal bounds fix a number."}
                </p>
                <button
                  className="text-button muted-action"
                  onClick={removeOperation}
                >
                  Remove operation
                </button>
              </div>
            </section>
          ) : (
            <div className="empty-groups">Add an operation to begin.</div>
          )}
        </main>
        <aside className="session-column" aria-labelledby="session-heading">
          <h2 id="session-heading">Session settings</h2>
          <p className="section-help">Choose how you want to practice.</p>
          <div className="session-type">
            <h3>Session type</h3>
            <div className="segmented">
              <button
                className={config.session.format === "timed" ? "selected" : ""}
                aria-pressed={config.session.format === "timed"}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    session: { ...c.session, format: "timed" },
                  }))
                }
              >
                Timed
              </button>
              <button
                className={
                  config.session.format === "endless" ? "selected" : ""
                }
                aria-pressed={config.session.format === "endless"}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    session: { ...c.session, format: "endless" },
                  }))
                }
              >
                Endless
              </button>
            </div>
          </div>
          {config.session.format === "timed" && (
            <div className="duration-settings">
              <h3>Duration</h3>
              <div className="duration-shortcuts">
                {[
                  [30, "30s"],
                  [60, "1m"],
                  [120, "2m"],
                  [300, "5m"],
                  [600, "10m"],
                ].map(([seconds, label]) => (
                  <button
                    key={seconds}
                    aria-pressed={
                      config.session.durationSeconds === String(seconds)
                    }
                    className={
                      config.session.durationSeconds === String(seconds)
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        session: {
                          ...c.session,
                          durationSeconds: String(seconds),
                        },
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="custom-duration">
                Custom duration (seconds)
                <input
                  aria-label="Custom duration in seconds"
                  inputMode="numeric"
                  value={config.session.durationSeconds}
                  aria-invalid={Boolean(errors.duration)}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      session: {
                        ...c.session,
                        durationSeconds: e.target.value,
                      },
                    }))
                  }
                />
              </label>
              <ErrorText>{errors.duration}</ErrorText>
            </div>
          )}
          <label className="countdown-option">
            <input
              type="checkbox"
              checked={config.session.countdown}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  session: { ...c.session, countdown: e.target.checked },
                }))
              }
            />
            3-second countdown
          </label>
          <div className="preset-settings">
            <h3>Preset</h3>
            <select
              aria-label="Preset"
              value={selectedPreset}
              onChange={(e) => choosePreset(e.target.value)}
            >
              <option value="">Custom (unsaved)</option>
              <optgroup label="Starting presets">
                {defaults.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {presets.length > 0 && (
                <optgroup label="Your presets">
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="preset-actions">
              <button
                className="text-button underlined"
                disabled={!valid || !ready || busy}
                onClick={() => setDialog("save")}
              >
                Save preset
              </button>
              {userPreset && (
                <>
                  <button
                    className="text-button"
                    disabled={!valid || busy}
                    onClick={update}
                  >
                    Update
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setDialog("rename")}
                  >
                    Rename
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={removePreset}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
            <p className="save-status" role="status">
              {modified ? "Unsaved preset changes" : notice}
            </p>
          </div>
          <div className="start-settings">
            <button
              className="primary-button start-button"
              onClick={() => void start(false)}
              disabled={!valid || !ready || busy}
            >
              {!ready ? "Connecting…" : busy ? "Starting…" : "Start practice"}
            </button>
            <p className="section-help">
              Answers advance automatically when correct.
            </p>
            {!valid && (
              <p className="field-error">
                Fix the highlighted settings to start.
              </p>
            )}
          </div>
          <ExportActions />
        </aside>
        {dialog && (
          <NameDialog
            title={dialog === "save" ? "Save practice preset" : "Rename preset"}
            initial={dialog === "rename" ? userPreset?.name || "" : ""}
            onClose={() => setDialog(null)}
            onSave={dialog === "save" ? save : rename}
          />
        )}
      </div>
    </>
  );
}
