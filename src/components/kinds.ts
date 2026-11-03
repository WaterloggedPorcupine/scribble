import { Globe, Inbox, Lightbulb, ListTodo, Scissors, Users, type LucideIcon } from 'lucide-react'
import type { NoteKind } from '../lib/db'

export const KIND_META: Record<NoteKind, { label: string; plural: string; libraryPlural: string; icon: LucideIcon; empty: string; placeholder: string }> = {
  character: {
    label: 'Character',
    plural: 'Characters',
    libraryPlural: 'Character ideas',
    icon: Users,
    empty: 'Who’s in this story? Start with whoever you can hear most clearly.',
    placeholder: 'Backstory, wants, fears, what they’d never admit…',
  },
  idea: {
    label: 'Idea',
    plural: 'Ideas',
    libraryPlural: 'Story ideas',
    icon: Lightbulb,
    empty: 'Scraps, what-ifs, images, overheard lines. Nothing is too small.',
    placeholder: 'What if…',
  },
  world: {
    label: 'World note',
    plural: 'World',
    libraryPlural: 'World notes',
    icon: Globe,
    empty: 'Places, rules, history: the things that stay true.',
    placeholder: 'What’s true about this place?',
  },
  todo: {
    label: 'To-do',
    plural: 'To-dos',
    libraryPlural: 'To-dos',
    icon: ListTodo,
    empty: 'Nothing waiting. Leave yourself [TK: notes] in the text and they’ll gather here.',
    placeholder: '',
  },
  inbox: {
    label: 'Inbox item',
    plural: 'Inbox',
    libraryPlural: 'Inbox',
    icon: Inbox,
    empty: 'Imported notes land here so you can sort them whenever you feel like it.',
    placeholder: '',
  },
  cutting: {
    label: 'Cutting',
    plural: 'Cutting room floor',
    libraryPlural: 'Cutting room floor',
    icon: Scissors,
    empty: 'Text you cut with the scissors lands here, just in case.',
    placeholder: '',
  },
}

export const SIDEBAR_KINDS: NoteKind[] = ['character', 'idea', 'world', 'todo', 'inbox', 'cutting']
