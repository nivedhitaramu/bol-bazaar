"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, Hourglass, Keyboard, Loader2, Package, Play, RotateCw, Send, Truck, Wifi, WifiOff, Zap } from "lucide-react";
import { MicButton } from "./MicButton";
import { HandsFreeStatus, HandsFreeToggle } from "./HandsFree";
import { RecoveryCard } from "./RecoveryCard";
import { applyChoice, classifyYesNo, matchOption, recoveryText, type Clarify, type ConfirmValue } from "@/lib/recovery";
import { answerText, consumeSimulateNoise, serverConfig, useFailures } from "@/lib/client/recoveryClient";
import { useHandsFree } from "@/lib/client/useHandsFree";
import { useToast } from "./Toast";
import { useVoiceInput, type VoiceResult } from "@/lib/client/useVoiceInput";
import { ClientApiError, getJson, postVoice, SwitchedToBrowserStt } from "@/lib/client/api";
import { play, speak } from "@/lib/client/player";
import { type PeerState, subscribeConversation, subscribeOrders } from "@/lib/client/realtime";
import { translator } from "@/lib/i18n";
import { missingNumbers } from "@/lib/numbers";
import { langInfo, normalizeLang } from "@/lib/languages";
import { formatINR, listingFor, type Conversation, type Message, type Order, type Product, type Seller } from "@/lib/types";

type ConvData = {
  conversation: Conversation & { seller: Seller; product: Pick<Product, "id" | "name" | "photo_url" | "price" | "listing"> | null };
  messages: Message[];
  orders: Order[];
};

type RelayResponse = {
  action?: "sent" | "confirm" | "clarify" | "undo";
  transcript?: string;
  prompt?: string;
  audio?: string | null;
  mime?: string | null;
  clarify?: Clarify;
  values?: ConfirmValue[];
  message: Message;
  translatedOk: boolean;
  ttsOk: boolean;
  timings: { stt_ms: number; translate_ms: number; tts_ms: number; store_ms: number; total_ms: number };
};

export function ChatPanel({
  conversationId,
  side,
  soundEnabled,
  compact = false,
  panelId,
}: {
  conversationId: string;
  side: "buyer" | "seller";
  soundEnabled: boolean;
  compact?: boolean;
  panelId: string;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<ConvData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [myState, setMyState] = useState<PeerState>("idle");
  const [peerState, setPeerState] = useState<PeerState>("idle");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [latency, setLatency] = useState<Record<string, number>>({});
  const [live, setLive] = useState(false);
  // Sarvam configured → an untranslated message is a temporary failure ("Translation pending"),
  // not a missing key. Never guess: show the original until the retry succeeds.
  const [sarvamOn, setSarvamOn] = useState(false);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const autoRetried = useRef(new Set<string>());
  useEffect(() => {
    serverConfig().then((c) => setSarvamOn(c.sarvam));
  }, []);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");

  const sub = useRef<ReturnType<typeof subscribeConversation> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const peerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const myLang = data ? normalizeLang(side === "buyer" ? data.conversation.buyer_language : data.conversation.seller.language) : "en-IN";
  const theirLang = data ? normalizeLang(side === "buyer" ? data.conversation.seller.language : data.conversation.buyer_language) : "en-IN";
  const t = translator(myLang);
  const peerName = data ? (side === "buyer" ? data.conversation.seller.name : data.conversation.buyer_name) : "";
  const myLangRef = useRef(myLang);
  myLangRef.current = myLang;

  // Load
  useEffect(() => {
    let cancelled = false;
    getJson<ConvData>(`/api/conversations/${conversationId}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setMessages(d.messages);
        setOrders(d.orders);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const autoPlay = useCallback(
    (m: Message) => {
      if (!soundRef.current) return;
      play(
        heardAs(m, myLangRef.current),
        {
          onStart: () => {
            setPlayingId(m.id);
            setMyState("speaking");
          },
          onEnd: () => {
            setPlayingId(null);
            setMyState((s) => (s === "speaking" ? "idle" : s));
          },
        }
      );
    },
    []
  );

  // Realtime
  useEffect(() => {
    if (!data) return;
    const s = subscribeConversation(
      conversationId,
      {
        onMessage: (m, kind) => {
          setMessages((xs) => {
            const i = xs.findIndex((x) => x.id === m.id);
            if (i >= 0) {
              const copy = xs.slice();
              copy[i] = { ...copy[i], ...m };
              return copy;
            }
            return [...xs, m];
          });
          if (kind === "INSERT" && m.sender !== side) autoPlay(m);
        },
        onStatus: (st) => {
          if (st.side === side) return; // ignore our own broadcasts
          setPeerState(st.state);
          // Safety: clear a stale indicator if the peer's tab closed mid-recording.
          if (peerTimer.current) clearTimeout(peerTimer.current);
          if (st.state !== "idle") peerTimer.current = setTimeout(() => setPeerState("idle"), 35_000);
        },
        onOrder: upsertOrder,
        onConnection: setLive,
        onDelete: (id) => setMessages((xs) => xs.filter((x) => x.id !== id)),
      },
      data.messages.map((m) => m.id)
    );
    sub.current = s;
    function upsertOrder(o: Order) {
      if (o.conversation_id !== conversationId) return;
      setOrders((xs) => {
        const i = xs.findIndex((x) => x.id === o.id);
        if (i < 0) return [o, ...xs];
        const copy = xs.slice();
        copy[i] = o;
        return copy;
      });
    }
    const unsubOrders = subscribeOrders(upsertOrder);
    return () => {
      s.unsubscribe();
      unsubOrders();
      sub.current = null;
    };
  }, [data, conversationId, side, autoPlay]);

  // Auto-scroll
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, peerState]);

  const status = useCallback(
    (state: PeerState) => {
      setMyState(state);
      sub.current?.sendStatus({ side, state, panel: panelId });
    },
    [side, panelId]
  );

  // ── "When things go wrong": confirm numbers, clarify sound-alikes, undo, two strikes → text box ──
  type Pending =
    | { kind: "confirm"; transcript: string; prompt: string; clarified: boolean }
    | { kind: "clarify"; transcript: string; prompt: string; clarify: Clarify };
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  const say = (text: string, audio?: { base64?: string | null; mime?: string | null }) =>
    play({ base64: audio?.base64 ?? null, mime: audio?.mime ?? null, text, lang: myLangRef.current });
  const failures = useFailures(() => {
    setShowText(true);
    toast(recoveryText("typeOffer", myLangRef.current));
    say(recoveryText("typeOffer", myLangRef.current));
  });

  /** Take back my last message ("No, wrong" / "illa, thappu" / "nahi, galat"). */
  const undoLast = async () => {
    const mine = [...messagesRef.current].reverse().find((m) => m.sender === side);
    if (!mine) return;
    const res = await fetch(`/api/messages/${mine.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, sender: side }),
    });
    if (res.ok) {
      setMessages((xs) => xs.filter((x) => x.id !== mine.id));
      toast(recoveryText("undone", myLangRef.current), "success");
      say(recoveryText("undone", myLangRef.current));
    } else toast(t("errorGeneric"), "error");
  };

  const relay = async (input: VoiceResult, flags: { clarified?: boolean; confirmed?: boolean } = {}) => {
    status("translating");
    try {
      const r = await postVoice<RelayResponse>("/api/relay", input, {
        conversationId,
        sender: side,
        checks: "1",
        simulateNoise: !flags.clarified && !flags.confirmed && consumeSimulateNoise() ? "1" : undefined,
        clarified: flags.clarified ? "1" : undefined,
        confirmed: flags.confirmed ? "1" : undefined,
      });
      failures.reset();
      if (r.action === "undo") return void (await undoLast());
      if (r.action === "clarify" && r.clarify && r.transcript && r.prompt) {
        setPending({ kind: "clarify", transcript: r.transcript, prompt: r.prompt, clarify: r.clarify });
        return void say(r.prompt, { base64: r.audio, mime: r.mime });
      }
      if (r.action === "confirm" && r.transcript && r.prompt) {
        setPending({ kind: "confirm", transcript: r.transcript, prompt: r.prompt, clarified: Boolean(flags.clarified) });
        return void say(r.prompt, { base64: r.audio, mime: r.mime });
      }
      setPending(null);
      setMessages((xs) => (xs.some((x) => x.id === r.message.id) ? xs : [...xs, r.message]));
      setLatency((l) => ({ ...l, [r.message.id]: r.timings.total_ms }));
      if (!r.translatedOk || !r.ttsOk) toast(t("fallbackVoice"));
    } catch (e) {
      if (e instanceof SwitchedToBrowserStt) toast(`${t("fallbackStt")} — ${t("tapToSpeak")}`);
      else if (e instanceof ClientApiError && e.code === "empty_transcript") {
        toast(recoveryText("couldntHear", myLangRef.current));
        say(recoveryText("couldntHear", myLangRef.current));
      } else toast(t("errorGeneric"), "error");
      failures.fail();
    } finally {
      status("idle");
    }
  };

  /** The answer to a pending question — spoken (any surface, incl. hands-free) or tapped. */
  const answer = async (choice: "yes" | "no" | 0 | 1 | null) => {
    const p = pendingRef.current;
    if (!p) return;
    if (choice === null) {
      failures.fail();
      return void say(p.kind === "confirm" ? recoveryText("notSure", myLangRef.current) : p.prompt);
    }
    if (p.kind === "confirm") {
      if (choice === "yes") {
        setPending(null);
        return void relay({ text: p.transcript }, { confirmed: true, clarified: true });
      }
      setPending(null);
      return void say(recoveryText("sayAgain", myLangRef.current)); // nothing was sent
    }
    if (choice === 0 || choice === 1) {
      setPending(null);
      const fixed = applyChoice(p.transcript, p.clarify.word, p.clarify.options[choice]);
      return void relay({ text: fixed }, { clarified: true }); // numbers are still confirmed next
    }
    setPending(null);
    say(recoveryText("sayAgain", myLangRef.current));
  };

  const answerByVoice = async (input: VoiceResult) => {
    const p = pendingRef.current;
    if (!p) return;
    try {
      const text = await answerText(input, myLangRef.current);
      if (p.kind === "confirm") return void answer(classifyYesNo(text));
      const yn = classifyYesNo(text);
      if (yn === "no") return void answer("no");
      return void answer(matchOption(text, p.clarify.options));
    } catch {
      failures.fail();
      say(recoveryText("couldntHear", myLangRef.current));
    }
  };

  /** Retry a failed translation; on success the listener hears it (if it's theirs to hear). */
  const retryTranslation = useCallback(
    async (m: Message, manual: boolean) => {
      setRetrying((x) => ({ ...x, [m.id]: true }));
      try {
        const res = await fetch(`/api/messages/${m.id}/translate`, { method: "POST" });
        if (!res.ok) {
          if (manual) toast(t("translationPending"));
          return;
        }
        const { message } = (await res.json()) as { message: Message };
        setMessages((xs) => xs.map((x) => (x.id === message.id ? { ...x, ...message } : x)));
        if (message.sender !== side) autoPlay(message);
      } catch {
        if (manual) toast(t("errorGeneric"), "error");
      } finally {
        setRetrying((x) => ({ ...x, [m.id]: false }));
      }
    },
    [side, autoPlay, toast, t]
  );

  // One automatic retry, a few seconds later, for messages I received untranslated.
  // Timers live in a ref: re-renders (new messages, polling) must not cancel a scheduled retry.
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => retryTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!sarvamOn) return;
    for (const m of messages) {
      const untranslated = m.translated_text == null && m.original_language !== m.translated_language;
      if (!untranslated || m.sender === side || autoRetried.current.has(m.id)) continue;
      autoRetried.current.add(m.id);
      retryTimers.current.push(setTimeout(() => retryTranslation(m, false), 4000));
    }
  }, [messages, sarvamOn, side, retryTranslation]);

  /** Every utterance lands here: an answer to a pending question, or a new message. */
  const send = async (input: VoiceResult) => {
    if (pendingRef.current) return answerByVoice(input);
    return relay(input);
  };

  const voice = useVoiceInput({
    lang: myLang,
    onStart: () => status("listening"),
    onResult: send,
    onQuiet: () => {
      status("idle");
      toast(t("comeCloser"));
      say(t("comeCloser"));
      failures.fail();
    },
    onError: (k) => {
      status("idle");
      if (k !== "short") {
        toast(t("errorMic"), "error");
        setShowText(true);
      }
    },
  });

  const busy = myState === "translating";

  // ── Hands-free: continuous listening, each utterance → /api/relay (tap-to-talk stays the default) ──
  const [handsFree, setHandsFree] = useState(false);
  const hf = useHandsFree({
    id: panelId,
    enabled: handsFree,
    busy,
    lang: myLang,
    onUtterance: send,
    onSpeechStart: () => status("listening"),
    onDiscard: () => status("idle"),
    onTooQuiet: () => {
      toast(t("comeCloser"));
      speak(t("comeCloser"), myLang);
      failures.fail();
    },
    onStop: (reason) => {
      setHandsFree(false);
      if (reason === "mic") toast(t("errorMic"), "error");
    },
  });
  const hfPhase: "sending" | "speaking" | null = busy ? "sending" : hf.playing || myState === "speaking" ? "speaking" : null;

  const replay = (m: Message) => {
    const mine = m.sender === side;
    setPlayingId(m.id);
    if (mine) speak(m.original_text, myLang, { onEnd: () => setPlayingId(null) });
    else
      play(
        heardAs(m, myLang),
        { onEnd: () => setPlayingId(null) }
      );
  };

  if (loadError)
    return (
      <div className="grid h-full place-items-center p-6 text-center text-muted">
        <p>{t("errorGeneric")}</p>
      </div>
    );
  if (!data)
    return (
      <div className="grid h-full min-h-60 place-items-center">
        <Loader2 className="size-8 animate-spin text-maroon" />
      </div>
    );

  const product = data.conversation.product;
  const productTitle = product ? (listingFor(product.listing, myLang.split("-")[0])?.title ?? product.name) : null;
  const order = orders[0];


  const peerLabel =
    peerState === "listening" ? `${peerName}: ${t("listening")}` : peerState === "translating" ? `${peerName}: ${t("translating")}` : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-sand bg-white px-3 py-2">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-maroon font-display text-lg font-bold text-white">
          {peerName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{peerName}</p>
          <p className="flex items-center gap-1 text-xs font-semibold text-muted">
            <span className="rounded bg-sand px-1.5 py-0.5">{langInfo(myLang).native}</span>
            <ArrowLeftRight className="size-3" />
            <span className="rounded bg-turmeric-soft px-1.5 py-0.5">{langInfo(theirLang).native}</span>
          </p>
        </div>
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${live ? "bg-leaf/10 text-leaf" : "bg-sand text-muted"}`}
          title={live ? "Realtime connected" : "Polling"}
        >
          {live ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
          {live ? "LIVE" : "SYNC"}
        </span>
      </div>

      {/* Product + order strip */}
      {product && !compact && (
        <Link href={`/product/${product.id}`} className="flex items-center gap-3 border-b border-sand bg-white/70 px-3 py-2">
          {product.photo_url && <img src={product.photo_url} alt="" className="size-10 rounded-lg object-cover" />}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{productTitle}</span>
          <span className="text-sm font-extrabold text-saffron">{formatINR(product.price)}</span>
        </Link>
      )}
      {order && <OrderTracker order={order} t={t} />}

      {/* Messages */}
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.map((m) => {
          const mine = m.sender === side;
          const big = mine ? m.original_text : (m.translated_text ?? m.original_text);
          const small = mine ? m.translated_text : m.original_text;
          const smallLang = mine ? m.translated_language : m.original_language;
          const untranslated = m.translated_text == null && m.original_language !== m.translated_language;
          // Back-check: a number in the original that isn't in the translation → never show it silently.
          const lostNumbers = m.translated_text ? missingNumbers(m.original_text, m.translated_text) : [];
          const needsCheck = lostNumbers.length > 0;
          const playing = playingId === m.id;
          return (
            <div key={m.id} className={`msg-in flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ${
                  mine ? "rounded-br-md bg-maroon text-white" : "rounded-bl-md bg-white text-ink"
                } ${playing ? "ring-4 ring-turmeric/70" : ""}`}
              >
                <p className={`${compact ? "text-base" : "text-lg"} font-semibold leading-snug`}>{big}</p>
                {needsCheck && (
                  <div
                    role="alert"
                    className={`mt-1.5 rounded-xl px-2.5 py-1.5 text-sm ${mine ? "bg-white/15 text-white" : "bg-turmeric-soft text-ink"}`}
                  >
                    <span className="mr-1.5 inline-flex items-center rounded-full bg-saffron px-2 py-0.5 text-xs font-extrabold text-white">
                      ⚠ {t("checkTranslation")}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide opacity-70">{t("original")}:</span>{" "}
                    <span className="font-semibold">{m.original_text}</span>
                  </div>
                )}
                {untranslated &&
                  (sarvamOn ? (
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${mine ? "bg-white/15 text-white/80" : "bg-turmeric-soft text-maroon"}`}
                      >
                        <Hourglass className={`size-3 ${retrying[m.id] ? "animate-spin" : ""}`} /> {t("translationPending")}
                      </span>
                      <button
                        type="button"
                        onClick={() => retryTranslation(m, true)}
                        disabled={retrying[m.id]}
                        className={`tap-56 inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold ${mine ? "bg-white/20 text-white" : "bg-maroon text-white"}`}
                      >
                        <RotateCw className={`size-3 ${retrying[m.id] ? "animate-spin" : ""}`} /> {t("retry")}
                      </button>
                    </span>
                  ) : (
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${mine ? "bg-white/15 text-white/80" : "bg-turmeric-soft text-maroon"}`}
                    >
                      🔑 {t("translationKeyNotSet")}
                    </span>
                  ))}
                {small && small !== big && (
                  <p className={`mt-1 text-sm leading-snug ${mine ? "text-white/65" : "text-muted"}`}>
                    <span className="mr-1 text-xs font-bold uppercase tracking-wide opacity-80">
                      {smallLang ? langInfo(smallLang).native : t("original")}
                    </span>
                    {small}
                  </p>
                )}
                <div className={`mt-1.5 flex items-center gap-2 text-xs ${mine ? "text-white/70" : "text-muted"}`}>
                  <button
                    type="button"
                    onClick={() => replay(m)}
                    className={`tap-56 flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold ${mine ? "bg-white/15" : "bg-sand"}`}
                    aria-label={t("replay")}
                  >
                    {playing ? (
                      <span className="eq">
                        <span /><span /><span />
                      </span>
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {t("replay")}
                  </button>
                  {latency[m.id] != null && (
                    <span className="flex items-center gap-0.5 font-bold" title="speech → stored & delivered">
                      <Zap className="size-3" />
                      {(latency[m.id] / 1000).toFixed(1)}s
                    </span>
                  )}
                  <span className="ml-auto">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>
          );
        })}
        {peerLabel && (
          <div className="msg-in flex justify-start">
            <div className="flex items-center gap-2 rounded-3xl rounded-bl-md bg-white px-4 py-3 text-sm font-semibold text-maroon shadow-sm">
              <span className="dots">
                <span /><span /><span />
              </span>
              {peerLabel}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-sand bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2">
        {pending && (
          <RecoveryCard
            kind={pending.kind}
            prompt={pending.prompt}
            options={pending.kind === "clarify" ? pending.clarify.options : undefined}
            lang={myLang}
            busy={busy}
            compact={compact}
            labels={{ yes: t("yes"), no: t("no"), tapToSpeak: t("tapToSpeak"), listening: t("listening") }}
            onVoice={answerByVoice}
            onPick={(c) => answer(c)}
          />
        )}
        <div className="mb-2">
          <HandsFreeToggle on={handsFree} onChange={setHandsFree} label={t("handsFree")} hint={t("handsFreeHint")} compact />
        </div>
        {!handsFree && (
        <p
          className={`mb-1 h-5 text-center text-sm font-bold ${
            myState === "listening" ? "text-saffron" : myState === "idle" ? "text-muted" : "text-maroon"
          }`}
          aria-live="polite"
        >
          {myState === "listening"
            ? `${t("listening")} ${Math.ceil((voice.maxMs - voice.elapsed) / 1000)}s`
            : myState === "translating"
              ? t("translating")
              : myState === "speaking"
                ? t("speaking")
                : t("tapToSpeak")}
        </p>
        )}
        {!handsFree && voice.interim && <p className="mb-1 text-center text-xs italic text-muted">“{voice.interim}”</p>}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowText((s) => !s)}
            className={`grid size-14 place-items-center rounded-full ${showText ? "bg-maroon text-white" : "bg-sand text-ink"}`}
            aria-label={t("typeInstead")}
          >
            <Keyboard className="size-6" />
          </button>
          {handsFree ? (
            <HandsFreeStatus
              state={hf.state}
              phase={hfPhase}
              level={hf.level}
              interim={hf.interim}
              compact={compact}
              labels={{ listening: t("listening"), sending: t("sending"), speaking: t("speaking") }}
            />
          ) : (
            <MicButton
              state={busy || voice.state === "processing" ? "busy" : voice.state === "recording" ? "recording" : "idle"}
              level={voice.level}
              progress={voice.elapsed / voice.maxMs}
              onPress={voice.toggle}
              size={compact ? "md" : "lg"}
              label={voice.state === "recording" ? t("stop") : t("tapToSpeak")}
            />
          )}
          <div className="size-14" aria-hidden />
        </div>
        {showText && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const s = text.trim();
              if (!s || busy) return;
              setText("");
              send({ text: s });
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="input"
              placeholder={t("typeInstead")}
              aria-label={t("typeInstead")}
              lang={myLang}
            />
            <button type="submit" className="btn btn-primary shrink-0 px-4" disabled={busy || !text.trim()} aria-label={t("send")}>
              <Send className="size-5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function OrderTracker({ order, t }: { order: Order; t: ReturnType<typeof translator> }) {
  const steps = ["placed", "confirmed", "shipped", "delivered"] as const;
  const idx = steps.indexOf(order.status);
  const icons = [Package, Check, Truck, Check];
  return (
    <div className="flex items-center gap-1 border-b border-sand bg-turmeric-soft/60 px-3 py-2">
      {steps.map((s, i) => {
        const Icon = icons[i];
        const done = i <= idx;
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full transition ${done ? "bg-leaf text-white" : "bg-white text-muted"} ${i === idx ? "ring-2 ring-leaf/30" : ""}`}
            >
              <Icon className="size-3.5" />
            </span>
            <span className={`truncate text-xs font-bold ${done ? "text-leaf" : "text-muted"}`}>{t(`status_${s}`)}</span>
            {i < steps.length - 1 && <span className={`h-0.5 flex-1 rounded ${i < idx ? "bg-leaf" : "bg-white"}`} />}
          </div>
        );
      })}
    </div>
  );
}

/** What the listener hears: the translation (server audio or browser TTS), or — with no translation — the original. */
function heardAs(m: Message, myLang: string) {
  if (m.translated_text == null) return { url: null, text: m.original_text, lang: m.original_language };
  return { url: m.audio_url, text: m.translated_text, lang: myLang };
}
