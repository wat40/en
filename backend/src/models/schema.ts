import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  decimal,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 32 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 100 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    bannerUrl: varchar('banner_url', { length: 500 }),
    bio: text('bio'),
    status: varchar('status', { length: 20 }).default('offline'),
    customStatus: varchar('custom_status', { length: 128 }),
    verified: boolean('verified').default(false),
    bot: boolean('bot').default(false),
    system: boolean('system').default(false),
    mfaEnabled: boolean('mfa_enabled').default(false),
    locale: varchar('locale', { length: 10 }).default('en-US'),
    flags: integer('flags').default(0),
    premiumType: integer('premium_type').default(0),
    publicFlags: integer('public_flags').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    usernameIdx: index('idx_users_username').on(table.username),
    emailIdx: index('idx_users_email').on(table.email),
    createdAtIdx: index('idx_users_created_at').on(table.createdAt),
  })
);

// User sessions table
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    refreshTokenHash: varchar('refresh_token_hash', { length: 255 }),
    deviceInfo: jsonb('device_info'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_user_sessions_user_id').on(table.userId),
    tokenHashIdx: index('idx_user_sessions_token_hash').on(table.tokenHash),
    expiresAtIdx: index('idx_user_sessions_expires_at').on(table.expiresAt),
  })
);

// Servers (Guilds) table
export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    iconUrl: varchar('icon_url', { length: 500 }),
    bannerUrl: varchar('banner_url', { length: 500 }),
    splashUrl: varchar('splash_url', { length: 500 }),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    region: varchar('region', { length: 20 }).default('us-east'),
    afkChannelId: uuid('afk_channel_id'),
    afkTimeout: integer('afk_timeout').default(300),
    verificationLevel: integer('verification_level').default(0),
    defaultMessageNotifications: integer('default_message_notifications').default(0),
    explicitContentFilter: integer('explicit_content_filter').default(0),
    features: text('features').array().default([]),
    mfaLevel: integer('mfa_level').default(0),
    systemChannelId: uuid('system_channel_id'),
    systemChannelFlags: integer('system_channel_flags').default(0),
    rulesChannelId: uuid('rules_channel_id'),
    publicUpdatesChannelId: uuid('public_updates_channel_id'),
    preferredLocale: varchar('preferred_locale', { length: 10 }).default('en-US'),
    premiumTier: integer('premium_tier').default(0),
    premiumSubscriptionCount: integer('premium_subscription_count').default(0),
    vanityUrlCode: varchar('vanity_url_code', { length: 50 }).unique(),
    memberCount: integer('member_count').default(0),
    maxMembers: integer('max_members').default(500000),
    maxPresences: integer('max_presences'),
    nsfw: boolean('nsfw').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    ownerIdIdx: index('idx_servers_owner_id').on(table.ownerId),
    createdAtIdx: index('idx_servers_created_at').on(table.createdAt),
    vanityUrlIdx: uniqueIndex('idx_servers_vanity_url').on(table.vanityUrlCode),
  })
);

// Channels table
export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references(() => channels.id, { onDelete: 'set null' }),
    type: integer('type').notNull().default(0), // 0: text, 1: dm, 2: voice, 3: group_dm, 4: category
    name: varchar('name', { length: 100 }),
    topic: text('topic'),
    position: integer('position').default(0),
    nsfw: boolean('nsfw').default(false),
    rateLimitPerUser: integer('rate_limit_per_user').default(0),
    bitrate: integer('bitrate'),
    userLimit: integer('user_limit'),
    rtcRegion: varchar('rtc_region', { length: 20 }),
    videoQualityMode: integer('video_quality_mode').default(1),
    defaultAutoArchiveDuration: integer('default_auto_archive_duration'),
    permissions: jsonb('permissions').default([]),
    lastMessageId: uuid('last_message_id'),
    lastPinTimestamp: timestamp('last_pin_timestamp', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    serverIdIdx: index('idx_channels_server_id').on(table.serverId),
    parentIdIdx: index('idx_channels_parent_id').on(table.parentId),
    typeIdx: index('idx_channels_type').on(table.type),
  })
);

// Messages table (partitioned by created_at in production)
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id),
    content: text('content'),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
    editedTimestamp: timestamp('edited_timestamp', { withTimezone: true }),
    tts: boolean('tts').default(false),
    mentionEveryone: boolean('mention_everyone').default(false),
    mentions: uuid('mentions').array().default([]),
    mentionRoles: uuid('mention_roles').array().default([]),
    mentionChannels: uuid('mention_channels').array().default([]),
    attachments: jsonb('attachments').default([]),
    embeds: jsonb('embeds').default([]),
    reactions: jsonb('reactions').default([]),
    nonce: varchar('nonce', { length: 255 }),
    pinned: boolean('pinned').default(false),
    webhookId: uuid('webhook_id'),
    type: integer('type').default(0),
    activity: jsonb('activity'),
    application: jsonb('application'),
    applicationId: uuid('application_id'),
    messageReference: jsonb('message_reference'),
    flags: integer('flags').default(0),
    referencedMessageId: uuid('referenced_message_id').references(() => messages.id),
    threadId: uuid('thread_id'),
    components: jsonb('components').default([]),
    stickerItems: jsonb('sticker_items').default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    channelIdIdx: index('idx_messages_channel_id').on(table.channelId),
    authorIdIdx: index('idx_messages_author_id').on(table.authorId),
    timestampIdx: index('idx_messages_timestamp').on(table.timestamp),
    threadIdIdx: index('idx_messages_thread_id').on(table.threadId),
  })
);

// Roles table
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    color: integer('color').default(0),
    hoist: boolean('hoist').default(false),
    iconUrl: varchar('icon_url', { length: 500 }),
    unicodeEmoji: varchar('unicode_emoji', { length: 100 }),
    position: integer('position').notNull().default(0),
    permissions: bigint('permissions', { mode: 'bigint' }).default(BigInt(0)),
    managed: boolean('managed').default(false),
    mentionable: boolean('mentionable').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    serverIdIdx: index('idx_roles_server_id').on(table.serverId),
    positionIdx: index('idx_roles_position').on(table.position),
  })
);

// Server members table
export const serverMembers = pgTable(
  'server_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    nickname: varchar('nickname', { length: 32 }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
    premiumSince: timestamp('premium_since', { withTimezone: true }),
    deaf: boolean('deaf').default(false),
    mute: boolean('mute').default(false),
    pending: boolean('pending').default(false),
    permissions: bigint('permissions', { mode: 'bigint' }),
    communicationDisabledUntil: timestamp('communication_disabled_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    serverUserIdx: uniqueIndex('idx_server_members_server_user').on(table.serverId, table.userId),
    serverIdIdx: index('idx_server_members_server_id').on(table.serverId),
    userIdIdx: index('idx_server_members_user_id').on(table.userId),
    joinedAtIdx: index('idx_server_members_joined_at').on(table.joinedAt),
  })
);

// Member roles (many-to-many)
export const memberRoles = pgTable(
  'member_roles',
  {
    memberId: uuid('member_id').notNull().references(() => serverMembers.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
    assignedBy: uuid('assigned_by').references(() => users.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.memberId, table.roleId] }),
    memberIdIdx: index('idx_member_roles_member_id').on(table.memberId),
    roleIdIdx: index('idx_member_roles_role_id').on(table.roleId),
  })
);

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  ownedServers: many(servers),
  serverMemberships: many(serverMembers),
  messages: many(messages),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

export const serversRelations = relations(servers, ({ one, many }) => ({
  owner: one(users, {
    fields: [servers.ownerId],
    references: [users.id],
  }),
  channels: many(channels),
  members: many(serverMembers),
  roles: many(roles),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  server: one(servers, {
    fields: [channels.serverId],
    references: [servers.id],
  }),
  parent: one(channels, {
    fields: [channels.parentId],
    references: [channels.id],
  }),
  children: many(channels),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  author: one(users, {
    fields: [messages.authorId],
    references: [users.id],
  }),
  referencedMessage: one(messages, {
    fields: [messages.referencedMessageId],
    references: [messages.id],
  }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  server: one(servers, {
    fields: [roles.serverId],
    references: [servers.id],
  }),
  memberRoles: many(memberRoles),
}));

export const serverMembersRelations = relations(serverMembers, ({ one, many }) => ({
  server: one(servers, {
    fields: [serverMembers.serverId],
    references: [servers.id],
  }),
  user: one(users, {
    fields: [serverMembers.userId],
    references: [users.id],
  }),
  roles: many(memberRoles),
}));

export const memberRolesRelations = relations(memberRoles, ({ one }) => ({
  member: one(serverMembers, {
    fields: [memberRoles.memberId],
    references: [serverMembers.id],
  }),
  role: one(roles, {
    fields: [memberRoles.roleId],
    references: [roles.id],
  }),
  assignedByUser: one(users, {
    fields: [memberRoles.assignedBy],
    references: [users.id],
  }),
}));
