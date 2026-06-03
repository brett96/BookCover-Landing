"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import memberScenes from "@/lib/member-scenes.json";
import agentScenes from "@/lib/agent-scenes.json";

const SCENE_DUR = 4500;

type Scene = {
  type: string;
  tag: string;
  title: string;
  sub: string;
  accent?: string;
  html?: string;
};

type DemoKey = "member" | "agent";

const SCENES: Record<DemoKey, Scene[]> = {
  member: memberScenes as Scene[],
  agent: agentScenes as Scene[],
};

type Props = {
  open: boolean;
  which: DemoKey | null;
  onClose: () => void;
  onLaunch: (which: DemoKey) => void;
};

export default function PreviewReel({ open, which, onClose, onLaunch }: Props) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const advanceRef = useRef<() => void>(() => {});

  const scenes = which ? SCENES[which] : [];
  const sc = scenes[idx];

  const goScene = useCallback(
    (i: number) => {
      setIdx(i);
      setEnded(false);
    },
    []
  );

  advanceRef.current = () => {
    if (idx < scenes.length - 1) {
      goScene(idx + 1);
      setPlaying(true);
    } else {
      setPlaying(false);
      setEnded(true);
    }
  };

  useEffect(() => {
    if (!open || !playing || ended) return;
    const t = setTimeout(() => advanceRef.current(), SCENE_DUR);
    return () => clearTimeout(t);
  }, [open, playing, ended, idx, scenes.length]);

  useEffect(() => {
    if (open && which) {
      setIdx(0);
      setPlaying(true);
      setEnded(false);
    }
  }, [open, which]);

  if (!open || !which || !sc) return null;

  const copy = (
    <div className="reel-copy reel-fade">
      <span className="reel-tag">{sc.tag}</span>
      <div className="reel-h">{sc.title}</div>
      <div className="reel-sub">{sc.sub}</div>
    </div>
  );

  let stage: React.ReactNode;
  let stageClass = "reel-stage";
  if (sc.type === "screen" && sc.html) {
    stage = (
      <>
        <div className="reel-phone reel-fade">
          <div className="reel-notch" />
          <div
            className="reel-screen"
            dangerouslySetInnerHTML={{ __html: sc.html }}
          />
        </div>
        {copy}
      </>
    );
  } else if (sc.type === "browser" && sc.html) {
    stageClass = "reel-stage wide";
    stage = (
      <>
        <div className="reel-browser reel-fade">
          <div
            className="reel-scaler"
            dangerouslySetInnerHTML={{ __html: sc.html }}
          />
        </div>
        {copy}
      </>
    );
  } else {
    stageClass = "reel-stage card-only";
    stage = (
      <div className="reel-copy reel-fade" style={{ maxWidth: 540, margin: "0 auto" }}>
        <div className="reel-card-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--gold-l)" strokeWidth={2}>
            {sc.accent === "outro" ? (
              <polygon points="5 3 19 12 5 21 5 3" />
            ) : (
              <>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </>
            )}
          </svg>
        </div>
        <span className="reel-tag">{sc.tag}</span>
        <div className="reel-h">{sc.title}</div>
        <div className="reel-sub">{sc.sub}</div>
      </div>
    );
  }

  return (
    <div
      className="reel-overlay show"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="reel">
        <div className="reel-top">
          <div className="reel-brand">
            <div className="reel-mark">
              <svg viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div className="reel-ttl">
              <span>{which === "member" ? "Member Experience Preview" : "Agent Portal Preview"}</span>
              <div>
                {which === "member" ? "BookCover Member App" : "BookCover Retention Portal"}
              </div>
            </div>
          </div>
          <button type="button" className="reel-x" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="reel-bars">
          {scenes.map((_, bi) => (
            <div
              key={bi}
              className={`reel-bar${bi < idx ? " done" : ""}${bi === idx ? " active" : ""}`}
            >
              <i style={bi < idx ? { width: "100%" } : bi === idx && playing ? {} : { width: 0 }} />
            </div>
          ))}
        </div>
        <div className={stageClass}>{stage}</div>
        <div className="reel-ctrls">
          <div className="reel-nav">
            <button type="button" className="reel-btn" onClick={() => idx > 0 && goScene(idx - 1)} title="Previous">
              <svg viewBox="0 0 24 24" stroke="none">
                <polygon points="19 20 9 12 19 4 19 20" />
                <rect x="5" y="4" width="2" height="16" />
              </svg>
            </button>
            <button
              type="button"
              className="reel-btn"
              onClick={() => {
                if (ended) {
                  goScene(0);
                  setPlaying(true);
                  setEnded(false);
                } else setPlaying((p) => !p);
              }}
              title="Play/Pause"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" stroke="none">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" stroke="none">
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="reel-btn"
              onClick={() => idx < scenes.length - 1 && goScene(idx + 1)}
              title="Next"
            >
              <svg viewBox="0 0 24 24" stroke="none">
                <polygon points="5 4 15 12 5 20 5 4" />
                <rect x="17" y="4" width="2" height="16" />
              </svg>
            </button>
            <span className="reel-step">
              {idx + 1} / {scenes.length}
            </span>
          </div>
          <button
            type="button"
            className="btn-g"
            style={{ padding: "11px 22px", fontSize: 13 }}
            onClick={() => {
              onClose();
              onLaunch(which);
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Launch full demo
          </button>
        </div>
      </div>
    </div>
  );
}
