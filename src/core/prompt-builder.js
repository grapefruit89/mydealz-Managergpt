/**
 * prompt-builder.js
 * Pure Prompt-Text-Erzeugung für den AI-Exporter (Stufen aus MdmPromptLevels).
 *
 * Quelle: Exporter-Split (Claude/DeepSeek-Reviews 2026-09-11, Fund 1/2):
 * Textbau = pure Funktion (testbar), Orchestrierung = Exporter, UI = dünn.
 * Der LLM-Chat (ROADMAP §2.14) konsumiert dieselben Bausteine statt eine
 * Kopie des Prompt-Systems.
 *
 * Depends on: MdmPromptLevels (SSOT Levels/Labels), CommentNormalizer
 */

const PromptBuilder = (() => {

  const _LEVELS = {
    RAW: {
      gen: (meta, comments) => JSON.stringify({ meta, comments }, null, 2),
    },
    SHORT: {
      gen: (meta, comments) =>
        `# Context\n${JSON.stringify(meta, null, 2)}\n\n# Comments\n${CommentNormalizer.formatComments(comments)}`,
    },
    MEDIUM: {
      gen: (meta, comments) =>
        `# Role: Community Sentiment Analyst\n\n# Metadata\n${JSON.stringify(meta, null, 2)}\n\n# Thread (Nested)\n${CommentNormalizer.formatComments(comments)}\n\n# Task\nAnalysiere Sentiment und extrahiere Schlüsselfakten.`,
    },
    DETAILED: {
      gen: (meta, comments) =>
        `# Role: UX Researcher\n\n# Metadata\n${JSON.stringify(meta, null, 2)}\n\n# Thread\n${CommentNormalizer.formatComments(comments)}\n\n# Protocol\nAnalysiere Interaktionen zwischen Haupt- und Antwortkommentaren.`,
    },
  };

  /** Eine Stufe bauen. */
  function build(level, meta, comments) {
    return (_LEVELS[level] ?? _LEVELS.MEDIUM).gen(meta, comments);
  }

  /** Alle Stufen als Objekt (SidePanel-Payload), Keys = MdmPromptLevels.LEVELS. */
  function buildAll(meta, comments) {
    const out = {};
    for (const level of MdmPromptLevels.LEVELS) out[level] = build(level, meta, comments);
    return out;
  }

  return { build, buildAll };

})();

if (typeof module !== 'undefined') module.exports = { PromptBuilder };
