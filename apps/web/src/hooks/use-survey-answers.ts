// State dan handler jawaban survey (radio, checkbox, other, skip)
import { useState, useCallback } from 'react';

interface SurveyQuestion {
  id: string;
  kind: 'radio' | 'checkbox';
  suggestion?: string;
}

export function useSurveyAnswers() {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [showOtherInput, setShowOtherInput] = useState<Record<string, boolean>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});

  const initFromQuestions = useCallback((questions: SurveyQuestion[]) => {
    const initialAnswers: Record<string, string | string[]> = {};
    for (const q of questions) {
      if ((q as any).value !== null && (q as any).value !== undefined) {
        initialAnswers[q.id] = (q as any).value;
      } else if ((q as any).answer) {
        if (q.kind === 'checkbox') {
          initialAnswers[q.id] = (q as any).answer.split(',').map((s: string) => s.trim());
        } else {
          initialAnswers[q.id] = (q as any).answer;
        }
      }
    }
    setAnswers(initialAnswers);
    setOtherText({});
    setShowOtherInput({});
    setSkipped({});
  }, []);

  const handleRadioSelect = useCallback((questionId: string, val: string) => {
    setSkipped((prev) => (prev[questionId] ? { ...prev, [questionId]: false } : prev));
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
    setShowOtherInput((prev) => ({ ...prev, [questionId]: false }));
  }, []);

  const handleCheckboxToggle = useCallback((questionId: string, val: string) => {
    setSkipped((prev) => (prev[questionId] ? { ...prev, [questionId]: false } : prev));
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      const next = current.includes(val) ? current.filter((item) => item !== val) : [...current, val];
      return { ...prev, [questionId]: next };
    });
  }, []);

  const handleSelectSuggestion = useCallback((q: SurveyQuestion) => {
    if (!q.suggestion) return;
    setSkipped((prev) => (prev[q.id] ? { ...prev, [q.id]: false } : prev));
    setAnswers((prev) => ({
      ...prev,
      [q.id]: q.kind === 'checkbox' ? [q.suggestion!] : q.suggestion!,
    }));
    setShowOtherInput((prev) => ({ ...prev, [q.id]: false }));
  }, []);

  const handleOtherChange = useCallback((questionId: string, text: string) => {
    setOtherText((prev) => ({ ...prev, [questionId]: text }));
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  }, []);

  const handleOtherClick = useCallback((questionId: string) => {
    setSkipped((prev) => (prev[questionId] ? { ...prev, [questionId]: false } : prev));
    setShowOtherInput((prev) => ({ ...prev, [questionId]: true }));
    setAnswers((prev) => ({ ...prev, [questionId]: otherText[questionId] || '' }));
  }, [otherText]);

  const handleSkipToggle = useCallback((questionId: string) => {
    setSkipped((prev) => {
      const willSkip = !prev[questionId];
      if (willSkip) {
        setAnswers((a) => { const n = { ...a }; delete n[questionId]; return n; });
        setOtherText((o) => { const n = { ...o }; delete n[questionId]; return n; });
        setShowOtherInput((s) => ({ ...s, [questionId]: false }));
      }
      return { ...prev, [questionId]: willSkip };
    });
  }, []);

  return {
    answers,
    setAnswers,
    otherText,
    showOtherInput,
    skipped,
    initFromQuestions,
    handleRadioSelect,
    handleCheckboxToggle,
    handleSelectSuggestion,
    handleOtherChange,
    handleOtherClick,
    handleSkipToggle,
  };
}