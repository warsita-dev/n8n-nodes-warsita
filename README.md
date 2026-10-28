# n8n-nodes-warsita

n8n nodes for [Warsita](https://warsita.com), the WhatsApp API: send WhatsApp messages, read contacts and groups, and start workflows when a message arrives.

- **Warsita**: send text, images, video, audio, documents, locations and polls; edit, delete and react to messages; follow their status; check which numbers use WhatsApp; read contacts, groups and the linked account. It can also be used as a tool by n8n's AI Agent.
- **Warsita Trigger**: starts a workflow on any of Warsita's webhook events, such as a received message, a poll vote or a message read. It verifies every delivery's signature.

## Installation

In n8n, open **Settings → Community Nodes → Install** and enter `n8n-nodes-warsita`. See n8n's [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/) for self-hosted setups.

## Credentials

Create a **Warsita API** credential:

| Field | Value |
| --- | --- |
| API Key | A session API key (`wsk_…`, from the session's page in the [dashboard](https://app.warsita.com)) or a personal access token (`wsp_…`, from **Settings → Access Tokens**). |
| Session ID | With a personal access token: the session (WhatsApp number) to use, `ses_…`. Leave it empty with a session API key. |
| Base URL | `https://api.warsita.com` |

A session API key is enough for the Warsita node. The **Warsita Trigger needs a personal access token and a Session ID**, because it sets the session's webhook.

## Warsita node

| Resource | Operations |
| --- | --- |
| Message | Send, Get, Get Many, Edit (within 20 minutes), Delete for everyone, React |
| Contact | Check Numbers, Get, Get Many |
| Group | Get, Get Many |
| Account | Get |

**To** takes a phone number with its country code (`+6281234567890`) or a WhatsApp ID (`…@s.whatsapp.net`, `…@lid`, a group `…@g.us`). Media is sent from a public URL. A sent message starts as `queued`; follow it with **Message → Get** or the `message.status` event.

If **Retry On Fail** runs a Send again in the same execution, Warsita answers with the message it already queued instead of sending it twice.

## Warsita Trigger

Pick the events to receive. When the workflow is activated, the trigger points the session's webhook at n8n and keeps its signing secret; when it is deactivated, it turns the webhook off again.

A session has one webhook URL. If it already sends to another URL (your own server, for example), the trigger refuses to activate unless **Replace Existing Webhook** is on; the old URL and events are put back when the workflow is deactivated. If you rotate the webhook secret in the dashboard, deactivate and activate the workflow again.

Each item is one event, for example:

```json
{
  "event": "messages.received",
  "session_id": "ses_3kV9mQ2pX7aL0zR5tN8w",
  "timestamp": "2026-10-28T08:15:02Z",
  "data": {
    "id": "3EB0C7730E83977E75CA",
    "chat": "6281234567890@s.whatsapp.net",
    "chat_type": "personal",
    "sender": "6281234567890@s.whatsapp.net",
    "sender_phone": "+6281234567890",
    "push_name": "Budi",
    "type": "text",
    "text": "Is my order on its way?",
    "timestamp": "2026-10-28T08:15:02Z"
  }
}
```

The events and their fields are listed at [warsita.com/docs/webhooks](https://warsita.com/docs/webhooks).

## Example workflows

- **Auto-reply:** Warsita Trigger (`messages-personal.received`) → AI Agent with the Warsita node as a tool → Warsita **Message → Send** to `{{ $json.data.chat }}`.
- **Order updates:** your shop's webhook or a schedule → Warsita **Message → Send** with the order status, then **Message → Get** to check it was delivered.
- **Poll results:** Warsita Trigger (`poll.vote`) → Google Sheets, one row per vote.

## Compatibility

Built with `@n8n/node-cli` for n8n 1.x and later. No runtime dependencies.

## Resources

- [Warsita docs](https://warsita.com/docs) and [API reference](https://warsita.com/docs/api)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

## Development

`npm install`, then `npm run dev` starts n8n with these nodes loaded. `npm run lint`, `npm run build` and `npm test` must pass. To release, run `npm run release`; pushing the tag publishes to npm from GitHub Actions with provenance (`.github/workflows/publish.yml`).

## License

[MIT](LICENSE)
