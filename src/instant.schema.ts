// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    aiUsage: i.entity({
      cost: i.number().optional(),
      duration: i.number().optional(),
      inputTokens: i.number().optional(),
      model: i.string().indexed().optional(),
      outputTokens: i.number().optional(),
      provider: i.string().indexed().optional(),
      success: i.boolean().indexed().optional(),
      taskType: i.string().indexed().optional(),
      timestamp: i.number().indexed().optional(),
      userId: i.string().indexed().optional(),
    }),
    memories: i.entity({
      content: i.string().optional(),
      importance: i.number().optional(),
      scope: i.string().indexed().optional(),
      tags: i.string().optional(),
      timestamp: i.number().indexed().optional(),
    }),
    presence: i.entity({
      activeFile: i.string().optional(),
      activeTab: i.string().optional(),
      activeView: i.string().optional(),
      cursorX: i.number().optional(),
      cursorY: i.number().optional(),
      lastActive: i.number().indexed().optional(),
      userId: i.string().indexed().optional(),
      userName: i.string().optional(),
    }),
    todos: i.entity({
      createdAt: i.number().optional(),
      done: i.boolean().optional(),
      text: i.string().optional(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
