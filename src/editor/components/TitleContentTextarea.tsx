import type { ChangeEvent, KeyboardEvent } from 'react';
import { replaceLineBreaksWithSpaces } from '../util/text';

import './TitleContentTextarea.css';

export type TitleContentTextareaProps = {
  onChange: (value: string) => void;
  onCommit: () => void;
  value: string;
};

export function TitleContentTextarea({
  onChange,
  onCommit,
  value,
}: TitleContentTextareaProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(replaceLineBreaksWithSpaces(event.target.value));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.blur();
  };

  return (
    <textarea
      aria-label='标题内容'
      className='ec-title-content-textarea'
      onBlur={onCommit}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      rows={3}
      value={value}
    />
  );
}
