import { useCallback, useEffect, useRef, useState } from "react";
import { useBoardStore } from "../store";
import { refreshCatalog, rpc } from "../multiplayer";
import type { ScenarioMeta, TrashItem } from "../types";

type Res = { ok: boolean; error?: string; [k: string]: unknown };
interface ListRes extends Res {
  scenarios: ScenarioMeta[];
  trash: TrashItem[];
}

const fmt = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Cenários salvos no servidor: criar, carregar, duplicar, renomear, excluir, exportar e importar JSON. */
export default function ScenarioPanel() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ScenarioMeta[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const scenario = useBoardStore((s) => s.scenario);
  const missing = useBoardStore((s) => s.missingAssets);
  const connected = useBoardStore((s) => s.connectionStatus === "connected");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const r = await rpc<ListRes>("scenario:list");
      if (r.ok) {
        setList(r.scenarios);
        setTrash(r.trash);
      }
    } catch {
      /* sem conexão: mantém a lista anterior */
    }
  }, []);

  useEffect(() => {
    if (open && connected) void reload();
  }, [open, connected, reload, scenario?.id]);

  function say(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      say("err", (e as Error).message);
    } finally {
      setBusy(false);
      void reload();
    }
  }

  const mood = () => useBoardStore.getState().mood;

  function describeMissing(m: { name: string; count: number }[]) {
    return m.length ? ` Assets ausentes (${m.length}): ${m.map((x) => `${x.name} ×${x.count}`).join(", ")}.` : "";
  }

  const saveRoomAs = () =>
    run(async () => {
      const name = window.prompt("Nome do novo cenário (guarda o mapa atual da sala):", "Meu cenário");
      if (!name) return;
      const r = await rpc("scenario:create", { name, mode: "room", mood: mood() });
      say(r.ok ? "ok" : "err", r.ok ? `Cenário “${name}” salvo. A sala agora o atualiza sozinha.` : r.error || "Falhou.");
    });

  const createBlank = () =>
    run(async () => {
      const name = window.prompt("Nome do cenário em branco:", "Novo cenário");
      if (!name) return;
      if (!window.confirm("Isso limpa o mapa atual da sala (tokens e dados continuam). Continuar?")) return;
      const r = await rpc("scenario:create", { name, mode: "blank", mood: mood() });
      say(r.ok ? "ok" : "err", r.ok ? `Cenário “${name}” criado e carregado.` : r.error || "Falhou.");
    });

  const load = (s: ScenarioMeta) =>
    run(async () => {
      if (!window.confirm(`Carregar “${s.name}”? Isso substitui o mapa atual da sala para todos.`)) return;
      const r = await rpc<Res & { missing: { name: string; count: number }[]; remapped: unknown[] }>("scenario:load", { id: s.id });
      say(r.ok ? "ok" : "err", r.ok ? `“${s.name}” carregado.${describeMissing(r.missing)}` : r.error || "Falhou.");
    });

  const saveNow = () =>
    run(async () => {
      const r = await rpc("scenario:save", { mood: mood() });
      say(r.ok ? "ok" : "err", r.ok ? "Salvo." : r.error || "Falhou.");
    });

  const duplicate = (s: ScenarioMeta) =>
    run(async () => {
      const r = await rpc<Res & { name: string }>("scenario:duplicate", { id: s.id });
      say(r.ok ? "ok" : "err", r.ok ? `Criado “${r.name}”.` : r.error || "Falhou.");
    });

  const rename = (s: ScenarioMeta) =>
    run(async () => {
      const name = window.prompt("Novo nome:", s.name);
      if (!name || name === s.name) return;
      const r = await rpc("scenario:rename", { id: s.id, name });
      say(r.ok ? "ok" : "err", r.ok ? "Renomeado." : r.error || "Falhou.");
    });

  const remove = (s: ScenarioMeta) =>
    run(async () => {
      if (!window.confirm(`Excluir “${s.name}”? Ele vai para a lixeira e pode ser restaurado por 30 dias.`)) return;
      const r = await rpc("scenario:delete", { id: s.id });
      say(r.ok ? "ok" : "err", r.ok ? "Movido para a lixeira." : r.error || "Falhou.");
    });

  const restore = (t: TrashItem) =>
    run(async () => {
      const r = await rpc<Res & { name: string }>("scenario:restore", { file: t.file });
      say(r.ok ? "ok" : "err", r.ok ? `“${r.name}” restaurado.` : r.error || "Falhou.");
    });

  function download(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const exportScenario = (id: string | null) =>
    run(async () => {
      const r = await rpc<Res & { filename: string; json: unknown }>(
        "scenario:export",
        id ? { id } : { current: true, mood: mood() }
      );
      if (!r.ok) return say("err", r.error || "Falhou.");
      download(r.filename, r.json);
      say("ok", `Exportado: ${r.filename}`);
    });

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void run(async () => {
      if (file.size > 5 * 1024 * 1024) return say("err", "Arquivo grande demais (máx. 5 MB).");
      const json = await file.text();
      const r = await rpc<
        Res & {
          name: string;
          report: { droppedProps: number; droppedSprites: number; truncated: boolean };
          missing: { name: string; count: number }[];
          remapped: unknown[];
        }
      >("scenario:import", { json });
      if (!r.ok) return say("err", r.error || "Falhou.");
      const dropped = r.report.droppedProps + r.report.droppedSprites;
      say(
        r.missing.length || dropped ? "err" : "ok",
        `Importado como “${r.name}” (não foi carregado na sala).` +
          (dropped ? ` ${dropped} item(ns) inválido(s) descartado(s).` : "") +
          (r.remapped.length ? ` ${r.remapped.length} asset(s) reconhecido(s) pelo conteúdo.` : "") +
          describeMissing(r.missing)
      );
      void refreshCatalog(true);
    });
  };

  return (
    <div style={styles.panel}>
      <div style={styles.head} onClick={() => setOpen(!open)}>
        <strong>
          💾 Cenários
          {scenario ? <span style={styles.linked}> · {scenario.name}</span> : null}
        </strong>
        <span>{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div style={styles.body}>
          <div style={styles.status}>
            {scenario ? (
              <>Sala ligada a <b>{scenario.name}</b>. Mudanças no mapa são salvas automaticamente.</>
            ) : (
              <>Sala sem cenário ligado. Salve o mapa atual como cenário para guardá-lo no servidor.</>
            )}
          </div>

          {missing.length > 0 && (
            <div style={styles.warn}>
              ⚠ {missing.length} asset(s) ausente(s): {missing.map((m) => `${m.name} ×${m.count}`).join(", ")}. Os objetos
              continuam no cenário e voltam a aparecer quando o asset for importado.
            </div>
          )}

          <div style={styles.row}>
            <button style={styles.btnActive} disabled={busy} onClick={saveRoomAs}>Salvar sala como cenário</button>
            {scenario && <button style={styles.btn} disabled={busy} onClick={saveNow}>Salvar agora</button>}
            <button style={styles.btn} disabled={busy} onClick={createBlank}>Novo em branco</button>
            <button style={styles.btn} disabled={busy} onClick={() => fileRef.current?.click()}>Importar JSON</button>
            <button style={styles.btn} disabled={busy} onClick={() => exportScenario(null)}>Exportar mapa atual</button>
            <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={onImportFile} />
          </div>

          {msg && <div style={msg.kind === "ok" ? styles.ok : styles.err}>{msg.text}</div>}

          <strong style={styles.label}>Salvos no servidor ({list.length})</strong>
          {list.length === 0 && <span style={styles.hint}>Nenhum cenário salvo ainda.</span>}
          {list.map((s) => (
            <div key={s.id} style={{ ...styles.item, ...(scenario?.id === s.id ? styles.itemActive : null) }}>
              <div style={styles.itemTitle}>
                <b>{s.name}</b>
                {scenario?.id === s.id && <span style={styles.tag}>em uso</span>}
              </div>
              <div style={styles.hint}>
                {s.sprites} sprites · {s.props} objetos 3D · {fmt(s.updatedAt)}
              </div>
              <div style={styles.row}>
                <button style={styles.btnSm} disabled={busy} onClick={() => load(s)}>Carregar</button>
                <button style={styles.btnSm} disabled={busy} onClick={() => duplicate(s)}>Duplicar</button>
                <button style={styles.btnSm} disabled={busy} onClick={() => rename(s)}>Renomear</button>
                <button style={styles.btnSm} disabled={busy} onClick={() => exportScenario(s.id)}>Exportar</button>
                <button style={styles.btnDanger} disabled={busy} onClick={() => remove(s)}>Excluir</button>
              </div>
            </div>
          ))}

          {trash.length > 0 && (
            <>
              <strong style={styles.label}>Lixeira (30 dias)</strong>
              {trash.map((t) => (
                <div key={t.file} style={styles.item}>
                  <div style={styles.itemTitle}><b>{t.name}</b></div>
                  <div style={styles.hint}>excluído em {fmt(t.deletedAt)}</div>
                  <button style={styles.btnSm} disabled={busy} onClick={() => restore(t)}>Restaurar</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const base: React.CSSProperties = {
  background: "#352a21",
  color: "#f1e6d6",
  border: "1px solid #5a4a3a",
  borderRadius: 6,
  padding: "5px 8px",
  cursor: "pointer",
  fontSize: 12,
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    left: 12,
    bottom: 12,
    width: 330,
    maxHeight: "55vh",
    display: "flex",
    flexDirection: "column",
    background: "rgba(20, 16, 14, 0.92)",
    border: "1px solid #4a3a2c",
    borderRadius: 8,
    color: "#f1e6d6",
    fontFamily: "system-ui, sans-serif",
    zIndex: 10,
  },
  head: { display: "flex", justifyContent: "space-between", padding: "10px 12px", cursor: "pointer", gap: 8 },
  linked: { fontWeight: 400, opacity: 0.75 },
  body: { overflowY: "auto", padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 },
  status: { fontSize: 12, opacity: 0.85, lineHeight: 1.4 },
  label: { fontSize: 12, letterSpacing: 0.4, opacity: 0.85, marginTop: 4 },
  hint: { fontSize: 11, opacity: 0.6 },
  row: { display: "flex", gap: 5, flexWrap: "wrap" },
  item: { border: "1px solid #3a3028", borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: 5 },
  itemActive: { borderColor: "#a8762c" },
  itemTitle: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, gap: 6 },
  tag: { fontSize: 10, background: "#a8762c", color: "#1a140f", borderRadius: 4, padding: "1px 5px", fontWeight: 700 },
  btn: base,
  btnSm: { ...base, padding: "3px 6px", fontSize: 11 },
  btnActive: { ...base, background: "#a8762c", color: "#1a140f", border: "1px solid #c99043", fontWeight: 600 },
  btnDanger: { ...base, padding: "3px 6px", fontSize: 11, background: "#5a2020", border: "1px solid #7a3030" },
  ok: { fontSize: 12, background: "#1f3a24", border: "1px solid #2f6a3a", borderRadius: 6, padding: 6, lineHeight: 1.4 },
  err: { fontSize: 12, background: "#4a2a1a", border: "1px solid #8a5a2a", borderRadius: 6, padding: 6, lineHeight: 1.4 },
  warn: { fontSize: 12, background: "#4a3a1a", border: "1px solid #8a7a2a", borderRadius: 6, padding: 6, lineHeight: 1.4 },
};
