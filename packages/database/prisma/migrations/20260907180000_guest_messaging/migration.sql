CREATE TABLE guest_message_consents (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE, channel varchar(16) NOT NULL CHECK(channel IN ('SMS','WHATSAPP')),
 destination_hash char(64) NOT NULL, allowed boolean NOT NULL DEFAULT false, evidence varchar(300) NOT NULL,
 recorded_by_id uuid NOT NULL REFERENCES users(id), updated_at timestamp(3) NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,guest_id,channel)
);
CREATE TABLE guest_messages (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE, created_by_id uuid NOT NULL REFERENCES users(id),
 channel varchar(16) NOT NULL CHECK(channel IN ('SMS','WHATSAPP')), destination_hash char(64) NOT NULL,
 encrypted_payload text NOT NULL, request_key varchar(100) NOT NULL, request_hash char(64) NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'QUEUED', provider_sid varchar(40) UNIQUE, error_code varchar(80),
 attempted_at timestamp(3), created_at timestamp(3) NOT NULL DEFAULT now(), updated_at timestamp(3) NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,request_key,guest_id)
);
CREATE INDEX guest_messages_workspace_id_created_at_idx ON guest_messages(workspace_id,created_at);
CREATE TABLE guest_message_suppressions (
 destination_hash char(64) NOT NULL, channel varchar(16) NOT NULL, blocked boolean NOT NULL DEFAULT true,
 updated_at timestamp(3) NOT NULL DEFAULT now(), PRIMARY KEY(destination_hash,channel)
);
ALTER TABLE guest_message_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_message_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE guest_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE guest_message_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_message_suppressions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON guest_message_consents, guest_messages TO weddingos_app, weddingos_worker;
GRANT SELECT ON guest_message_suppressions TO weddingos_app, weddingos_worker;
CREATE POLICY consent_workspace ON guest_message_consents FOR ALL TO weddingos_app
 USING(workspace_id = nullif(current_setting('app.current_workspace_id',true),'')::uuid AND public.weddingos_has_workspace_access(workspace_id))
 WITH CHECK(workspace_id = nullif(current_setting('app.current_workspace_id',true),'')::uuid AND public.weddingos_has_workspace_access(workspace_id));
CREATE POLICY message_workspace ON guest_messages FOR ALL TO weddingos_app
 USING(workspace_id = nullif(current_setting('app.current_workspace_id',true),'')::uuid AND public.weddingos_has_workspace_access(workspace_id))
 WITH CHECK(workspace_id = nullif(current_setting('app.current_workspace_id',true),'')::uuid AND public.weddingos_has_workspace_access(workspace_id));
CREATE POLICY consent_worker ON guest_message_consents FOR ALL TO weddingos_worker
 USING(public.weddingos_worker_execution_context_matches(NULL,NULL,NULL,workspace_id,NULL))
 WITH CHECK(public.weddingos_worker_execution_context_matches(NULL,NULL,NULL,workspace_id,NULL));
CREATE POLICY message_worker ON guest_messages FOR ALL TO weddingos_worker
 USING(public.weddingos_worker_execution_context_matches(NULL,NULL,NULL,workspace_id,NULL))
 WITH CHECK(public.weddingos_worker_execution_context_matches(NULL,NULL,NULL,workspace_id,NULL));
CREATE POLICY suppression_lookup ON guest_message_suppressions FOR SELECT TO weddingos_app, weddingos_worker
 USING(destination_hash = nullif(current_setting('app.message_destination_hash',true),''));

-- Called only after the API verifies the complete Twilio signed form and sender.
CREATE FUNCTION public.sarbato_message_status(mid uuid, sid text, destination text, ch text, state text, err text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.guest_messages SET provider_sid=sid, status=state, error_code=err, updated_at=now()
 WHERE id=mid AND destination_hash=destination AND channel=ch AND (provider_sid IS NULL OR provider_sid=sid)
 AND status IN ('SENDING','UNKNOWN','ACCEPTED','QUEUED','SENT','DELIVERED')
 AND CASE state WHEN 'READ' THEN true WHEN 'DELIVERED' THEN status<>'READ'
 WHEN 'FAILED' THEN status NOT IN ('DELIVERED','READ') WHEN 'SENT' THEN status NOT IN ('DELIVERED','READ')
 WHEN 'ACCEPTED' THEN status IN ('SENDING','UNKNOWN','QUEUED','ACCEPTED') ELSE false END;
END $$;
CREATE FUNCTION public.sarbato_message_optout(destination text, ch text, is_blocked boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF ch NOT IN ('SMS','WHATSAPP') OR length(destination)<>64 THEN RETURN; END IF;
 INSERT INTO public.guest_message_suppressions(destination_hash,channel,blocked) VALUES(destination,ch,is_blocked)
 ON CONFLICT(destination_hash,channel) DO UPDATE SET blocked=excluded.blocked,updated_at=now();
END $$;
CREATE FUNCTION public.sarbato_message_daily_count()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT count(*) FROM public.guest_messages WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC');
$$;
REVOKE ALL ON FUNCTION public.sarbato_message_status(uuid,text,text,text,text,text), public.sarbato_message_optout(text,text,boolean), public.sarbato_message_daily_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sarbato_message_status(uuid,text,text,text,text,text), public.sarbato_message_optout(text,text,boolean), public.sarbato_message_daily_count() TO weddingos_app;
