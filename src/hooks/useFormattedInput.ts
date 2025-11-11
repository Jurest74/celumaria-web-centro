import { useState, useCallback } from 'react';
import { formatNumberInput, parseNumberInput } from '../utils/currency';

export const useFormattedNumberInput = (initialValue: number = 0) => {
  const [displayValue, setDisplayValue] = useState(formatNumberInput(initialValue));
  const [numericValue, setNumericValue] = useState(initialValue);

  const handleChange = useCallback((value: string) => {
    const formatted = formatNumberInput(value);
    const numeric = parseNumberInput(value);
    
    setDisplayValue(formatted);
    setNumericValue(numeric);
  }, []);

  const reset = useCallback((value: number = 0) => {
    const formatted = formatNumberInput(value);
    setDisplayValue(formatted);
    setNumericValue(value);
  }, []);

  return {
    displayValue,
    numericValue,
    handleChange,
    reset,
    setValue: (value: number) => {
      const formatted = formatNumberInput(value);
      setDisplayValue(formatted);
      setNumericValue(value);
    }
  };
};
