// Microsoft Graph client — reads a tenant's Microsoft 365 mailbox (app-only,
// client-credentials). Keeps email "within Microsoft": no third-party provider.
//
// Disabled (stub → returns nothing) until MSGRAPH_* env vars are set, so the
// service runs idle until you register an Azure AD app.
//
// Azure AD setup:
//   1. Register an app in Azure portal
//   2. Add APPLICATION permission: Mail.Read (+ Mail.ReadBasic.All for multiple mailboxes)
//   3. Grant admin consent
//   4. Create a client secret
//   5. Set env vars: MSGRAPH_TENANT_ID, MSGRAPH_CLIENT_ID, MSGRAPH_CLIENT_SECRET

const GRAPH = "https://graph.microsoft.com/v1.0";

function makeGraph(env = process.env) {
  const tenant = env.MSGRAPH_TENANT_ID;
  const clientId = env.MSGRAPH_CLIENT_ID;
  const clientSecret = env.MSGRAPH_CLIENT_SECRET;
  const enabled = !!(tenant && clientId && clientSecret);

  async function token() {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    });
    const res = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
    );
    if (!res.ok) throw new Error(`Graph token ${res.status}: ${await res.text()}`);
    return (await res.json()).access_token;
  }

  async function gget(tok, url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new Error(`Graph GET ${res.status}: ${await res.text()}`);
    return res.json();
  }

  return {
    enabled,

    // New inbox messages for `mailbox` (UPN/email) received after `sinceISO`.
    async listInbox(mailbox, sinceISO) {
      if (!enabled) return [];
      const tok = await token();
      const select = "id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,hasAttachments";
      let url =
        `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/Inbox/messages` +
        `?$top=25&$orderby=receivedDateTime desc&$select=${select}`;
      if (sinceISO) url += `&$filter=receivedDateTime gt ${sinceISO}`;
      const data = await gget(tok, url);
      const out = [];
      for (const m of data.value ?? []) {
        let attachments = [];
        if (m.hasAttachments) {
          try {
            const a = await gget(
              tok,
              `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${m.id}/attachments?$select=name,size,contentType`
            );
            attachments = (a.value ?? []).map((x) => ({
              name: x.name,
              size: x.size,
              content_type: x.contentType,
            }));
          } catch { /* tolerate */ }
        }
        out.push({
          id: m.id,
          subject: m.subject || "(no subject)",
          fromAddress: m.from?.emailAddress?.address ?? null,
          fromName: m.from?.emailAddress?.name ?? null,
          to: m.toRecipients?.[0]?.emailAddress?.address ?? mailbox,
          receivedAt: m.receivedDateTime,
          snippet: m.bodyPreview ?? "",
          bodyText: m.body?.contentType === "text" ? m.body?.content : (m.bodyPreview ?? ""),
          bodyHtml: m.body?.contentType === "html" ? m.body?.content : null,
          attachments,
        });
      }
      return out;
    },
  };
}

module.exports = { makeGraph };
