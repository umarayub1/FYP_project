// Barrel for the TipTap extensions that plug into the host editor.
//
// As each Plan-B wave lands, append the extension here. The host
// (`TipTapEditorImpl`) calls `editorExtensions(ctx)` and spreads the result
// into `useEditor({ extensions: [...] })`. Keeping this list in one place
// means the host never has to know about the individual extension imports.

import type { Extension, Node, Mark } from '@tiptap/core';
import type { TipTapEditorMode } from '../TipTapEditorImpl';
import { MathInline } from './MathInline';
import { MathBlock } from './MathBlock';
import { Callout } from './Callout';
import { CodeBlock } from './CodeBlock';
import { SlashCommand, type SlashCommandState } from './SlashCommand';
import { Subpage } from './Subpage';
import { Cloze } from './Cloze';
import { NoteLink } from './NoteLink';
import { BlockShortcuts } from './BlockShortcuts';
import { BlockGutter, type BlockGutterState } from './BlockGutter';
import { BubbleMenu, type BubbleMenuState } from './BubbleMenu';
import { Underline } from './Underline';
import { Highlight } from './Highlight';
import { buildSlashItems } from '../slashItems';

export interface ExtensionContextSnapshot {
  studySetId?: string;
  currentNoteId?: string;
  disableSubpage: boolean;
  disableCloze: boolean;
  mode: TipTapEditorMode;
  aiUnavailable: boolean;
}

export interface ExtensionContext {
  /** Fresh-read on every slash query — must reflect current AI status etc. */
  getSnapshot: () => ExtensionContextSnapshot;
  onSlashState: (state: SlashCommandState | null) => void;
  onGutterState: (state: BlockGutterState | null) => void;
  onBubbleState: (state: BubbleMenuState | null) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
type AnyExt = Extension<any, any> | Node<any, any> | Mark<any, any>;

export function editorExtensions(ctx: ExtensionContext): AnyExt[] {
  const slashItems = () => buildSlashItems(ctx.getSnapshot());

  return [
    Underline,
    Highlight,
    MathInline,
    MathBlock,
    Callout,
    CodeBlock,
    Subpage,
    Cloze,
    NoteLink,
    BlockShortcuts,
    BlockGutter.configure({ onState: ctx.onGutterState }),
    BubbleMenu.configure({ onState: ctx.onBubbleState }),
    SlashCommand.configure({ items: slashItems, onState: ctx.onSlashState }),
  ];
}
