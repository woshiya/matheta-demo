function asStringOrEmpty(v) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

function stepsToText(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return "";
  return steps
    .map((s, idx) => {
      const line = asStringOrEmpty(s).trim();
      if (!line) return "";
      return `${idx + 1}. ${line}`;
    })
    .filter(Boolean)
    .join("\n");
}

// Accept multiple shapes since n8n workflows vary.
// Normalized shape used by the UI:
// {
//   prompt: string,
//   finalAnswer: string,      // used for marking
//   solutionText: string,     // worked solution / steps
//   questionType: 'mcq'|'short'|'long',
//   difficulty: 'easy'|'medium'|'hard'
// }
export function normalizeGeneratedQuestions(data, fallbackSpecs = []) {
  const raw = data?.questions;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((q, idx) => {
      const spec = fallbackSpecs[idx] || {};

      // n8n might return strings or objects.
      if (typeof q === "string") {
        return {
          prompt: q,
          solution: "",
          questionType: spec.questionType || "short",
          difficulty: spec.difficulty || "medium",
        };
      }

      const prompt = asStringOrEmpty(q.question ?? q.prompt ?? q.text);
      const solutionBase = asStringOrEmpty(q.solution ?? q.answer ?? q.correct_answer ?? q.correctAnswer);
      const questionType = asStringOrEmpty((q.question_type ?? q.questionType ?? spec.questionType) || "short");
      const difficulty = asStringOrEmpty((q.difficulty ?? spec.difficulty) || "medium");

      const stepsText =
        stepsToText(q.steps) ||
        stepsToText(q.solution?.steps) ||
        stepsToText(q.solution?.workings);
      const explicitFinal = asStringOrEmpty(
        q.final_answer ?? q.finalAnswer ?? q.solution?.final_answer ?? q.solution?.finalAnswer
      );

      // In some workflows (like your screenshot) `solution` is the final answer
      // and `steps` contains the worked solution.
      const solutionLooksLikeFinal = Boolean(stepsText) && Boolean(solutionBase) && !solutionBase.includes("\n");
      const finalAnswer = (explicitFinal || (solutionLooksLikeFinal ? solutionBase : "")).trim();

      const solutionText = [
        stepsText,
        // Keep a clear final answer line inside the worked solution.
        finalAnswer ? `Final answer: ${finalAnswer}` : "",
        // If there are no steps, store whatever the generator returned as solution.
        !stepsText ? solutionBase : "",
      ]
        .filter((x) => String(x).trim().length > 0)
        .join("\n\n")
        .trim();

      return {
        prompt,
        finalAnswer,
        solutionText,
        questionType: questionType === "mcq" || questionType === "long" ? questionType : "short",
        difficulty: difficulty === "easy" || difficulty === "hard" ? difficulty : "medium",
        imageDataUrl: asStringOrEmpty(q.image_data_url ?? q.imageDataUrl),
        imageUrl: asStringOrEmpty(q.image_url ?? q.imageUrl),
      };
    })
    .filter((q) => q.prompt.trim().length > 0);
}
