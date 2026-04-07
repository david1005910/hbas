import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { episodesApi } from "../../api/episodes";
import type { AnimStyle } from "../../types";

const ANIM_STYLES: AnimStyle[] = [
  "Epic 3D Cinematic",
  "Hand-painted Watercolor 3D",
  "Ancient Fresco Style",
  "Dark Fantasy 3D",
  "Soft Illuminated Manuscript",
];

interface FormData {
  projectId: string;
  bibleBookId: number;
  titleKo: string;
  verseRange: string;
  sceneCount: number;
  animStyle: AnimStyle;
  targetDuration: number;
}

interface Props {
  projectId: string;
  onSubmit: (data: FormData) => void;
  isLoading?: boolean;
}

export function EpisodeForm({ projectId, onSubmit, isLoading }: Props) {
  const { data: books = [] } = useQuery({
    queryKey: ["bibleBooks"],
    queryFn: episodesApi.listBooks,
  });

  const [form, setForm] = useState<FormData>({
    projectId,
    bibleBookId: 1,
    titleKo: "",
    verseRange: "",
    sceneCount: 5,
    animStyle: "Epic 3D Cinematic",
    targetDuration: 300,
  });

  const set = (k: keyof FormData, v: string | number) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
      className="space-y-4"
    >
      <div>
        <label className="block text-parchment/70 text-sm mb-1 font-body">성경 책</label>
        <select
          value={form.bibleBookId}
          onChange={(e) => set("bibleBookId", Number(e.target.value))}
          className="w-full bg-ink border border-gold/30 text-parchment rounded-lg px-3 py-2 text-sm font-body"
        >
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nameKo} ({b.nameEn})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-parchment/70 text-sm mb-1 font-body">에피소드 제목 (한국어)</label>
        <input
          type="text"
          value={form.titleKo}
          onChange={(e) => set("titleKo", e.target.value)}
          placeholder="예: 천지 창조 - 빛의 탄생"
          required
          className="w-full bg-ink border border-gold/30 text-parchment rounded-lg px-3 py-2 text-sm font-body"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-parchment/70 text-sm mb-1 font-body">참조 절 범위</label>
          <input
            type="text"
            value={form.verseRange}
            onChange={(e) => set("verseRange", e.target.value)}
            placeholder="예: 1:1-31"
            className="w-full bg-ink border border-gold/30 text-parchment rounded-lg px-3 py-2 text-sm font-body"
          />
        </div>
        <div>
          <label className="block text-parchment/70 text-sm mb-1 font-body">씬 수</label>
          <input
            type="number"
            min={3} max={12}
            value={form.sceneCount}
            onChange={(e) => set("sceneCount", Number(e.target.value))}
            className="w-full bg-ink border border-gold/30 text-parchment rounded-lg px-3 py-2 text-sm font-body"
          />
        </div>
      </div>

      <div>
        <label className="block text-parchment/70 text-sm mb-1 font-body">애니메이션 스타일</label>
        <select
          value={form.animStyle}
          onChange={(e) => set("animStyle", e.target.value as AnimStyle)}
          className="w-full bg-ink border border-gold/30 text-parchment rounded-lg px-3 py-2 text-sm font-body"
        >
          {ANIM_STYLES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-parchment/70 text-sm mb-1 font-body">
          목표 영상 길이 ({Math.floor(form.targetDuration / 60)}분)
        </label>
        <input
          type="range" min={60} max={600} step={30}
          value={form.targetDuration}
          onChange={(e) => set("targetDuration", Number(e.target.value))}
          className="w-full accent-gold"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gold hover:bg-gold-light disabled:opacity-50 text-ink font-body font-semibold py-2.5 rounded-lg transition-colors"
      >
        {isLoading ? "생성 중..." : "에피소드 생성"}
      </button>
    </form>
  );
}
