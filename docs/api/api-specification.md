# API Specification

## Overview

The Enrichment API follows RESTful principles with GraphQL support for complex queries. Real-time features are implemented using WebSocket connections. The API is versioned and includes comprehensive authentication, rate limiting, and error handling.

## API Design Principles

1. **RESTful Design**: Standard HTTP methods and status codes
2. **Consistent Naming**: Snake_case for JSON fields, kebab-case for URLs
3. **Versioning**: URL-based versioning (v1, v2, etc.)
4. **Pagination**: Cursor-based pagination for large datasets
5. **Rate Limiting**: Per-user and per-endpoint rate limits
6. **Error Handling**: Consistent error response format
7. **Documentation**: OpenAPI 3.0 specification

## Base URL and Versioning

```
Production: https://api.enrichment.com/v1
Development: https://api-dev.enrichment.com/v1
```

## Authentication

### JWT Token Authentication
```http
Authorization: Bearer <jwt_token>
```

### Bot Token Authentication
```http
Authorization: Bot <bot_token>
```

## Core API Endpoints

### Authentication Endpoints

#### POST /auth/login
Login with email/username and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "mfa_code": "123456"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "username": "johndoe",
    "email": "user@example.com",
    "display_name": "John Doe",
    "avatar_url": "https://cdn.enrichment.com/avatars/123.png",
    "verified": true,
    "mfa_enabled": true
  }
}
```

#### POST /auth/register
Register a new user account.

**Request:**
```json
{
  "username": "johndoe",
  "email": "user@example.com",
  "password": "securepassword",
  "display_name": "John Doe",
  "invite_code": "abc123def"
}
```

#### POST /auth/refresh
Refresh access token using refresh token.

#### POST /auth/logout
Logout and invalidate tokens.

### User Endpoints

#### GET /users/@me
Get current user information.

**Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "username": "johndoe",
  "email": "user@example.com",
  "display_name": "John Doe",
  "avatar_url": "https://cdn.enrichment.com/avatars/123.png",
  "banner_url": "https://cdn.enrichment.com/banners/123.png",
  "bio": "Software developer and Discord enthusiast",
  "status": "online",
  "custom_status": "Building the future",
  "verified": true,
  "bot": false,
  "mfa_enabled": true,
  "locale": "en-US",
  "premium_type": 1,
  "flags": 0,
  "public_flags": 0,
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### PATCH /users/@me
Update current user information.

#### GET /users/{user_id}
Get user information by ID.

#### GET /users/@me/servers
Get servers the current user is a member of.

#### GET /users/@me/channels
Get DM channels for the current user.

### Server Endpoints

#### GET /servers/{server_id}
Get server information.

**Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Awesome Community",
  "description": "A place for awesome people",
  "icon_url": "https://cdn.enrichment.com/icons/server123.png",
  "banner_url": "https://cdn.enrichment.com/banners/server123.png",
  "owner_id": "456e7890-e89b-12d3-a456-426614174000",
  "region": "us-east",
  "verification_level": 1,
  "default_message_notifications": 0,
  "explicit_content_filter": 1,
  "features": ["COMMUNITY", "NEWS", "THREADS"],
  "mfa_level": 1,
  "premium_tier": 2,
  "premium_subscription_count": 15,
  "member_count": 1250,
  "max_members": 500000,
  "vanity_url_code": "awesome",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### POST /servers
Create a new server.

#### PATCH /servers/{server_id}
Update server information.

#### DELETE /servers/{server_id}
Delete a server.

#### GET /servers/{server_id}/members
Get server members with pagination.

**Query Parameters:**
- `limit`: Number of members to return (1-1000, default 1)
- `after`: User ID to start after (for pagination)

#### GET /servers/{server_id}/channels
Get server channels.

#### GET /servers/{server_id}/roles
Get server roles.

### Channel Endpoints

#### GET /channels/{channel_id}
Get channel information.

**Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "server_id": "456e7890-e89b-12d3-a456-426614174000",
  "parent_id": "789e0123-e89b-12d3-a456-426614174000",
  "type": 0,
  "name": "general",
  "topic": "General discussion channel",
  "position": 0,
  "nsfw": false,
  "rate_limit_per_user": 0,
  "last_message_id": "987e6543-e89b-12d3-a456-426614174000",
  "permission_overwrites": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "type": "role",
      "allow": "1024",
      "deny": "0"
    }
  ],
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### POST /channels
Create a new channel.

#### PATCH /channels/{channel_id}
Update channel information.

#### DELETE /channels/{channel_id}
Delete a channel.

#### GET /channels/{channel_id}/messages
Get channel messages with pagination.

**Query Parameters:**
- `limit`: Number of messages to return (1-100, default 50)
- `before`: Message ID to get messages before
- `after`: Message ID to get messages after
- `around`: Message ID to get messages around

### Message Endpoints

#### POST /channels/{channel_id}/messages
Send a message to a channel.

**Request:**
```json
{
  "content": "Hello, world!",
  "tts": false,
  "embeds": [
    {
      "title": "Example Embed",
      "description": "This is an example embed",
      "color": 16711680,
      "fields": [
        {
          "name": "Field Name",
          "value": "Field Value",
          "inline": true
        }
      ]
    }
  ],
  "components": [],
  "sticker_ids": [],
  "message_reference": {
    "message_id": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```

**Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "channel_id": "456e7890-e89b-12d3-a456-426614174000",
  "author": {
    "id": "789e0123-e89b-12d3-a456-426614174000",
    "username": "johndoe",
    "display_name": "John Doe",
    "avatar_url": "https://cdn.enrichment.com/avatars/789.png"
  },
  "content": "Hello, world!",
  "timestamp": "2024-01-01T12:00:00Z",
  "edited_timestamp": null,
  "tts": false,
  "mention_everyone": false,
  "mentions": [],
  "mention_roles": [],
  "attachments": [],
  "embeds": [],
  "reactions": [],
  "pinned": false,
  "type": 0
}
```

#### GET /channels/{channel_id}/messages/{message_id}
Get a specific message.

#### PATCH /channels/{channel_id}/messages/{message_id}
Edit a message.

#### DELETE /channels/{channel_id}/messages/{message_id}
Delete a message.

#### PUT /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me
Add a reaction to a message.

#### DELETE /channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me
Remove a reaction from a message.

## Enhanced API Endpoints

### AI-Powered Features

#### POST /ai/moderate
Submit content for AI moderation.

**Request:**
```json
{
  "content": "Message content to moderate",
  "context": {
    "channel_id": "123e4567-e89b-12d3-a456-426614174000",
    "server_id": "456e7890-e89b-12d3-a456-426614174000"
  }
}
```

**Response:**
```json
{
  "approved": true,
  "confidence": 0.95,
  "flags": [],
  "suggested_action": "none",
  "explanation": "Content appears to be appropriate"
}
```

#### POST /ai/summarize
Generate conversation summary.

#### GET /search/messages
Search messages with AI-enhanced results.

**Query Parameters:**
- `query`: Search query
- `channel_id`: Limit to specific channel
- `server_id`: Limit to specific server
- `author_id`: Limit to specific author
- `before`: Messages before date
- `after`: Messages after date
- `limit`: Number of results (1-100, default 25)

### Reputation System

#### GET /users/{user_id}/reputation
Get user reputation scores.

#### GET /servers/{server_id}/leaderboard
Get server reputation leaderboard.

### Community Health

#### GET /servers/{server_id}/health
Get community health metrics.

**Response:**
```json
{
  "health_score": 0.85,
  "active_users_7d": 245,
  "message_count_7d": 1250,
  "positive_sentiment_ratio": 0.78,
  "toxicity_incidents_7d": 3,
  "engagement_trend": "increasing",
  "recommendations": [
    "Consider adding more interactive events",
    "Monitor recent toxicity incidents"
  ]
}
```

## WebSocket API

### Connection
```javascript
const socket = io('wss://gateway.enrichment.com', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Events

#### Client to Server Events

**identify**: Authenticate and identify the client
```json
{
  "token": "jwt_token",
  "properties": {
    "os": "Windows",
    "browser": "Chrome",
    "device": "Desktop"
  }
}
```

**join_server**: Join a server room
```json
{
  "server_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**join_channel**: Join a channel room
```json
{
  "channel_id": "456e7890-e89b-12d3-a456-426614174000"
}
```

**typing_start**: Indicate user is typing
```json
{
  "channel_id": "456e7890-e89b-12d3-a456-426614174000"
}
```

#### Server to Client Events

**ready**: Connection established and authenticated
```json
{
  "user": { /* user object */ },
  "servers": [ /* array of server objects */ ],
  "session_id": "session_123"
}
```

**message_create**: New message received
```json
{
  "message": { /* message object */ }
}
```

**message_update**: Message edited
```json
{
  "message": { /* updated message object */ }
}
```

**message_delete**: Message deleted
```json
{
  "message_id": "123e4567-e89b-12d3-a456-426614174000",
  "channel_id": "456e7890-e89b-12d3-a456-426614174000"
}
```

**typing_start**: User started typing
```json
{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "channel_id": "456e7890-e89b-12d3-a456-426614174000",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**presence_update**: User presence changed
```json
{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "online",
  "activities": []
}
```

## Rate Limiting

### Rate Limit Headers
```http
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 1640995200
X-RateLimit-Reset-After: 60
X-RateLimit-Bucket: user:123:messages
```

### Rate Limit Buckets
- **Global**: 50 requests per second
- **Messages**: 5 messages per 5 seconds per channel
- **Reactions**: 1 reaction per 0.25 seconds
- **Auth**: 5 login attempts per 5 minutes per IP

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": 40001,
    "message": "Unauthorized",
    "details": "Invalid or expired token"
  }
}
```

### Common Error Codes
- **40001**: Unauthorized
- **40003**: Forbidden
- **40004**: Not Found
- **42900**: Rate Limited
- **50000**: Internal Server Error
