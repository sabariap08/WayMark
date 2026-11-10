USE master
GO
IF DB_ID(N'WayMarkLocal') IS NULL
BEGIN
    CREATE DATABASE [WayMarkLocal]
END
GO
USE [WayMarkLocal]
GO
SET ANSI_NULLS ON
GO
SET ANSI_PADDING ON
GO
SET ANSI_WARNINGS ON
GO
SET ARITHABORT ON
GO
SET CONCAT_NULL_YIELDS_NULL ON
GO
SET QUOTED_IDENTIFIER ON
GO
SET NUMERIC_ROUNDABORT OFF
GO

CREATE TABLE [wm_schema_migrations] (
    [id] VARCHAR(120) NOT NULL,
    [description] VARCHAR(255) NULL,
    [applied_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_achievements] (
    [id] VARCHAR(36) NOT NULL,
    [user_id] VARCHAR(36) NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [kind] VARCHAR(40) NULL,
    [title] VARCHAR(220) NULL,
    [detail] TEXT NULL,
    [source] VARCHAR(40) NULL,
    [credential_id] VARCHAR(60) NULL,
    [shared] BIT NULL,
    [issued_at] DATETIME NULL,
    [dedupe_key] VARCHAR(160) NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_ai_logs] (
    [id] VARCHAR(36) NOT NULL,
    [feature] VARCHAR(60) NULL,
    [user] VARCHAR(160) NULL,
    [model] VARCHAR(60) NULL,
    [prompt] TEXT NULL,
    [response] TEXT NULL,
    [tokens] INT NULL,
    [status] VARCHAR(30) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_attendance_logs] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [registration_id] VARCHAR(36) NULL,
    [user_id] VARCHAR(36) NULL,
    [participant_name] VARCHAR(160) NULL,
    [participant_email] VARCHAR(200) NULL,
    [session] VARCHAR(80) NULL,
    [method] VARCHAR(40) NULL,
    [status] VARCHAR(40) NULL,
    [timestamp] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_audit_logs] (
    [id] VARCHAR(36) NOT NULL,
    [action] VARCHAR(200) NULL,
    [user] VARCHAR(160) NULL,
    [target] VARCHAR(220) NULL,
    [ip] VARCHAR(60) NULL,
    [status] VARCHAR(30) NULL,
    [timestamp] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_budget_categories] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [name] VARCHAR(160) NOT NULL,
    [planned_minor] INT NULL,
    [currency] VARCHAR(3) NULL,
    [sort_order] INT NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_budget_lines] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [category_id] VARCHAR(36) NULL,
    [description] VARCHAR(240) NULL,
    [kind] VARCHAR(30) NULL,
    [amount_minor] INT NULL,
    [currency] VARCHAR(3) NULL,
    [date] VARCHAR(20) NULL,
    [document_ref] VARCHAR(400) NULL,
    [created_by] VARCHAR(160) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_certificates] (
    [id] VARCHAR(36) NOT NULL,
    [recipient_name] VARCHAR(160) NULL,
    [recipient_id] VARCHAR(36) NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [issue_date] VARCHAR(60) NULL,
    [credential_id] VARCHAR(60) NULL,
    [issuer] VARCHAR(200) NULL,
    [type] VARCHAR(80) NULL,
    [status] VARCHAR(30) NULL,
    [withdrawn_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_checkin_exceptions] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [registration_id] VARCHAR(36) NULL,
    [user_id] VARCHAR(36) NULL,
    [participant_name] VARCHAR(160) NULL,
    [type] VARCHAR(80) NULL,
    [detail] TEXT NULL,
    [status] VARCHAR(30) NULL,
    [detected_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_event_approval_records] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [action] VARCHAR(40) NULL,
    [reason] TEXT NULL,
    [actor_id] VARCHAR(36) NULL,
    [actor_name] VARCHAR(160) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_event_plans] (
    [id] VARCHAR(36) NOT NULL,
    [user_id] VARCHAR(36) NULL,
    [title] VARCHAR(220) NULL,
    [brief] TEXT NULL,
    [plan] TEXT NULL,
    [validation] TEXT NULL,
    [status] VARCHAR(20) NULL,
    [applied_at] DATETIME NULL,
    [applied_ref] VARCHAR(36) NULL,
    [provider] VARCHAR(40) NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_event_types] (
    [id] VARCHAR(36) NOT NULL,
    [name] VARCHAR(80) NOT NULL,
    [tagline] VARCHAR(240) NULL,
    [css_class] VARCHAR(40) NULL,
    [sort_order] INT NULL,
    [is_system] BIT NULL,
    [config] TEXT NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_events] (
    [id] VARCHAR(36) NOT NULL,
    [host_id] VARCHAR(36) NULL,
    [host_name] VARCHAR(160) NULL,
    [title] VARCHAR(220) NOT NULL,
    [category] VARCHAR(80) NULL,
    [description] TEXT NULL,
    [date] VARCHAR(60) NULL,
    [time] VARCHAR(60) NULL,
    [location] VARCHAR(220) NULL,
    [seats] INT NULL,
    [status] VARCHAR(40) NULL,
    [approval_status] VARCHAR(40) NULL,
    [tone] VARCHAR(20) NULL,
    [initials] VARCHAR(6) NULL,
    [color] VARCHAR(20) NULL,
    [organizer] VARCHAR(160) NULL,
    [capacity_num] INT NULL,
    [registered_num] INT NULL,
    [waitlist_num] INT NULL,
    [reg_deadline] VARCHAR(60) NULL,
    [contact_email] VARCHAR(200) NULL,
    [website] VARCHAR(220) NULL,
    [tags] TEXT NULL,
    [certificates_enabled] BIT NULL,
    [jury_enabled] BIT NULL,
    [feedback_enabled] BIT NULL,
    [attendance_required] BIT NULL,
    [agenda] TEXT NULL,
    [requirements] TEXT NULL,
    [results_released] BIT NULL,
    [released_at] DATETIME NULL,
    [rejection_reason] TEXT NULL,
    [created_at] DATETIME NULL,
    [submitted_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    [event_type] VARCHAR(80) NULL,
    [parent_event_id] VARCHAR(36) NULL,
    [format] VARCHAR(20) NULL,
    [timezone] VARCHAR(60) NULL,
    [start_date] VARCHAR(20) NULL,
    [end_date] VARCHAR(20) NULL,
    [participation] VARCHAR(20) NULL,
    [currency] VARCHAR(3) NULL,
    [org_id] VARCHAR(36) NULL,
    [config] TEXT NULL,
    [settings] TEXT NULL,
    [slug] VARCHAR(160) NULL,
    [visibility] VARCHAR(20) NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_feedback] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [user_id] VARCHAR(36) NULL,
    [user_name] VARCHAR(160) NULL,
    [overall_rating] INT NULL,
    [content_rating] INT NULL,
    [organization_rating] INT NULL,
    [venue_rating] INT NULL,
    [what_worked] TEXT NULL,
    [what_didnt] TEXT NULL,
    [would_recommend] BIT NULL,
    [attend_again] BIT NULL,
    [anonymous] BIT NULL,
    [submitted_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_guest_access] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [kind] VARCHAR(20) NULL,
    [name] VARCHAR(160) NULL,
    [email] VARCHAR(200) NULL,
    [mobile] VARCHAR(60) NULL,
    [affiliation] VARCHAR(200) NULL,
    [panel_role] VARCHAR(80) NULL,
    [section] VARCHAR(120) NULL,
    [access_from] DATETIME NULL,
    [access_to] DATETIME NULL,
    [status] VARCHAR(20) NULL,
    [token_hash] VARCHAR(128) NULL,
    [activated_at] DATETIME NULL,
    [conflict_declared_at] DATETIME NULL,
    [revoked_at] DATETIME NULL,
    [created_by] VARCHAR(36) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_hosting_requests] (
    [id] VARCHAR(36) NOT NULL,
    [user_id] VARCHAR(36) NULL,
    [requester_name] VARCHAR(160) NULL,
    [requester_email] VARCHAR(200) NULL,
    [title] VARCHAR(220) NOT NULL,
    [category] VARCHAR(80) NULL,
    [description] TEXT NULL,
    [banner_url] VARCHAR(400) NULL,
    [date] VARCHAR(60) NULL,
    [end_date] VARCHAR(60) NULL,
    [time] VARCHAR(60) NULL,
    [location] VARCHAR(220) NULL,
    [venue] VARCHAR(220) NULL,
    [online_url] VARCHAR(300) NULL,
    [organizer] VARCHAR(160) NULL,
    [contact_email] VARCHAR(200) NULL,
    [contact_phone] VARCHAR(60) NULL,
    [website] VARCHAR(220) NULL,
    [seats] INT NULL,
    [reg_open] VARCHAR(60) NULL,
    [reg_deadline] VARCHAR(60) NULL,
    [eligibility] TEXT NULL,
    [fee] VARCHAR(80) NULL,
    [rules] TEXT NULL,
    [staffing] TEXT NULL,
    [documents] VARCHAR(400) NULL,
    [tags] TEXT NULL,
    [agenda] TEXT NULL,
    [requirements] TEXT NULL,
    [status] VARCHAR(30) NULL,
    [decision_reason] TEXT NULL,
    [decided_by] VARCHAR(160) NULL,
    [event_id] VARCHAR(36) NULL,
    [submitted_at] DATETIME NULL,
    [decided_at] DATETIME NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_incidents] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [title] VARCHAR(220) NOT NULL,
    [description] TEXT NULL,
    [severity] VARCHAR(20) NULL,
    [status] VARCHAR(20) NULL,
    [assignee_id] VARCHAR(36) NULL,
    [assignee_name] VARCHAR(160) NULL,
    [location] VARCHAR(200) NULL,
    [resolution] TEXT NULL,
    [created_by] VARCHAR(160) NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    [resolved_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_jobs] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [type] VARCHAR(60) NULL,
    [label] VARCHAR(220) NULL,
    [subject] VARCHAR(220) NULL,
    [audience] VARCHAR(80) NULL,
    [recipients_count] INT NULL,
    [status] VARCHAR(30) NULL,
    [error] TEXT NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_jury_assignments] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [jury_member_id] VARCHAR(36) NULL,
    [jury_name] VARCHAR(160) NULL,
    [jury_email] VARCHAR(200) NULL,
    [expertise] VARCHAR(160) NULL,
    [assigned_tracks] TEXT NULL,
    [status] VARCHAR(30) NULL,
    [guest_token] VARCHAR(60) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_mail_messages] (
    [id] VARCHAR(36) NOT NULL,
    [to_email] VARCHAR(200) NULL,
    [from_email] VARCHAR(200) NULL,
    [subject] VARCHAR(220) NULL,
    [body] TEXT NULL,
    [kind] VARCHAR(40) NULL,
    [status] VARCHAR(30) NULL,
    [error] TEXT NULL,
    [job_id] VARCHAR(36) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_notifications] (
    [id] VARCHAR(36) NOT NULL,
    [user_id] VARCHAR(36) NULL,
    [title] VARCHAR(200) NULL,
    [message] TEXT NULL,
    [type] VARCHAR(40) NULL,
    [read] BIT NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_offline_scans] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [client_scan_id] VARCHAR(80) NULL,
    [device_id] VARCHAR(80) NULL,
    [scanned_at] VARCHAR(40) NULL,
    [registration_id] VARCHAR(36) NULL,
    [ticket_code] VARCHAR(60) NULL,
    [participant_name] VARCHAR(160) NULL,
    [status] VARCHAR(20) NULL,
    [detail] TEXT NULL,
    [online] BIT NULL,
    [received_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_org_members] (
    [id] VARCHAR(36) NOT NULL,
    [org_id] VARCHAR(36) NULL,
    [user_id] VARCHAR(36) NULL,
    [org_role] VARCHAR(20) NULL,
    [permissions] TEXT NULL,
    [status] VARCHAR(20) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_organizations] (
    [id] VARCHAR(36) NOT NULL,
    [name] VARCHAR(200) NOT NULL,
    [slug] VARCHAR(120) NULL,
    [description] TEXT NULL,
    [website] VARCHAR(220) NULL,
    [contact_email] VARCHAR(200) NULL,
    [status] VARCHAR(20) NULL,
    [created_by] VARCHAR(36) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_otp_codes] (
    [id] VARCHAR(36) NOT NULL,
    [email] VARCHAR(200) NOT NULL,
    [code] VARCHAR(10) NOT NULL,
    [purpose] VARCHAR(40) NULL,
    [expires_at] DATETIME NOT NULL,
    [used] BIT NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_payments] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [registration_id] VARCHAR(36) NULL,
    [user_id] VARCHAR(36) NULL,
    [provider] VARCHAR(40) NULL,
    [provider_ref] VARCHAR(160) NULL,
    [idempotency_key] VARCHAR(160) NULL,
    [amount_minor] INT NULL,
    [currency] VARCHAR(3) NULL,
    [status] VARCHAR(20) NULL,
    [failure_reason] VARCHAR(300) NULL,
    [meta] TEXT NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_registrations] (
    [id] VARCHAR(36) NOT NULL,
    [user_id] VARCHAR(36) NULL,
    [user_name] VARCHAR(160) NULL,
    [user_email] VARCHAR(200) NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [category] VARCHAR(80) NULL,
    [date] VARCHAR(60) NULL,
    [time] VARCHAR(60) NULL,
    [location] VARCHAR(220) NULL,
    [status] VARCHAR(40) NULL,
    [attendance_status] VARCHAR(40) NULL,
    [ticket_code] VARCHAR(40) NULL,
    [qr_code_url] VARCHAR(300) NULL,
    [waitlist_position] INT NULL,
    [offer_expires_at] DATETIME NULL,
    [registered_at] DATETIME NULL,
    [identity_snapshot] TEXT NULL,
    [answers] TEXT NULL,
    [verification_state] VARCHAR(20) NULL,
    [verification_note] TEXT NULL,
    [qr_revoked_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_resource_bookings] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [session_id] VARCHAR(36) NULL,
    [resource_id] VARCHAR(36) NULL,
    [day] VARCHAR(20) NULL,
    [start_time] VARCHAR(10) NULL,
    [end_time] VARCHAR(10) NULL,
    [setup_minutes] INT NULL,
    [teardown_minutes] INT NULL,
    [status] VARCHAR(30) NULL,
    [notes] VARCHAR(300) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_resources] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [name] VARCHAR(200) NOT NULL,
    [kind] VARCHAR(40) NULL,
    [venue_id] VARCHAR(36) NULL,
    [capacity] INT NULL,
    [location] VARCHAR(200) NULL,
    [available_days] TEXT NULL,
    [available_from] VARCHAR(10) NULL,
    [available_to] VARCHAR(10) NULL,
    [setup_minutes] INT NULL,
    [teardown_minutes] INT NULL,
    [status] VARCHAR(30) NULL,
    [notes] TEXT NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_result_releases] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [round] VARCHAR(60) NULL,
    [released_at] DATETIME NULL,
    [released_by] VARCHAR(160) NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_rubrics] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [rubric_name] VARCHAR(200) NULL,
    [round] VARCHAR(60) NULL,
    [criteria] TEXT NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_schedule_conflicts] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [conflict_type] VARCHAR(60) NULL,
    [severity] VARCHAR(20) NULL,
    [resource_id] VARCHAR(36) NULL,
    [resource_name] VARCHAR(200) NULL,
    [session_ids] TEXT NULL,
    [session_titles] TEXT NULL,
    [person] VARCHAR(200) NULL,
    [day] VARCHAR(20) NULL,
    [start_time] VARCHAR(10) NULL,
    [end_time] VARCHAR(10) NULL,
    [message] TEXT NULL,
    [detail] TEXT NULL,
    [status] VARCHAR(20) NULL,
    [resolution] TEXT NULL,
    [detected_at] DATETIME NULL,
    [resolved_at] DATETIME NULL,
    [resolved_by] VARCHAR(160) NULL,
    [fingerprint] VARCHAR(120) NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_scores] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [submission_id] VARCHAR(36) NULL,
    [jury_member_id] VARCHAR(36) NULL,
    [jury_name] VARCHAR(160) NULL,
    [criteria] TEXT NULL,
    [total] FLOAT NULL,
    [max_score] FLOAT NULL,
    [comment] TEXT NULL,
    [status] VARCHAR(30) NULL,
    [submitted_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_sessions] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [parent_event_id] VARCHAR(36) NULL,
    [title] VARCHAR(220) NOT NULL,
    [description] TEXT NULL,
    [session_type] VARCHAR(40) NULL,
    [day] VARCHAR(20) NULL,
    [start_time] VARCHAR(10) NULL,
    [end_time] VARCHAR(10) NULL,
    [venue_id] VARCHAR(36) NULL,
    [room_name] VARCHAR(200) NULL,
    [capacity] INT NULL,
    [speakers] TEXT NULL,
    [track] VARCHAR(120) NULL,
    [status] VARCHAR(30) NULL,
    [order_index] INT NULL,
    [setup_minutes] INT NULL,
    [teardown_minutes] INT NULL,
    [required_resource_ids] TEXT NULL,
    [resource_deadline] VARCHAR(20) NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_settings] (
    [id] INT NOT NULL,
    [data] TEXT NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_sponsors] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [name] VARCHAR(200) NOT NULL,
    [contact_name] VARCHAR(160) NULL,
    [contact_email] VARCHAR(200) NULL,
    [contact_phone] VARCHAR(60) NULL,
    [package] VARCHAR(160) NULL,
    [promised_minor] INT NULL,
    [received_minor] INT NULL,
    [currency] VARCHAR(3) NULL,
    [status] VARCHAR(30) NULL,
    [logo_url] VARCHAR(400) NULL,
    [booth] VARCHAR(120) NULL,
    [deliverables] TEXT NULL,
    [notes] TEXT NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_submissions] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [team_name] VARCHAR(160) NULL,
    [project_title] VARCHAR(220) NULL,
    [track] VARCHAR(120) NULL,
    [status] VARCHAR(40) NULL,
    [description] TEXT NULL,
    [submitted_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_tasks] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [title] VARCHAR(220) NOT NULL,
    [description] TEXT NULL,
    [assignee_id] VARCHAR(36) NULL,
    [assignee_name] VARCHAR(160) NULL,
    [assignee_type] VARCHAR(20) NULL,
    [priority] VARCHAR(20) NULL,
    [due_at] DATETIME NULL,
    [status] VARCHAR(20) NULL,
    [depends_on] TEXT NULL,
    [session_id] VARCHAR(36) NULL,
    [resource_id] VARCHAR(36) NULL,
    [completion_notes] TEXT NULL,
    [created_by] VARCHAR(160) NULL,
    [created_at] DATETIME NULL,
    [updated_at] DATETIME NULL,
    [completed_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_users] (
    [id] VARCHAR(36) NOT NULL,
    [name] VARCHAR(160) NOT NULL,
    [email] VARCHAR(200) NOT NULL,
    [username] VARCHAR(80) NULL,
    [password_hash] VARCHAR(300) NULL,
    [role] VARCHAR(20) NULL,
    [status] VARCHAR(20) NULL,
    [events_count] INT NULL,
    [phone] VARCHAR(40) NULL,
    [org] VARCHAR(160) NULL,
    [bio] TEXT NULL,
    [website] VARCHAR(220) NULL,
    [location] VARCHAR(160) NULL,
    [birth_date] VARCHAR(30) NULL,
    [pronouns] VARCHAR(40) NULL,
    [email_updates] BIT NULL,
    [sms_reminders] BIT NULL,
    [public_profile] BIT NULL,
    [created_at] DATETIME NULL,
    [notify_prefs] TEXT NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_venues] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [name] VARCHAR(200) NOT NULL,
    [address] VARCHAR(300) NULL,
    [city] VARCHAR(120) NULL,
    [latitude] FLOAT NULL,
    [longitude] FLOAT NULL,
    [map_url] VARCHAR(400) NULL,
    [directions] VARCHAR(400) NULL,
    [capacity] INT NULL,
    [accessibility] TEXT NULL,
    [is_primary] BIT NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_volunteers] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [event_title] VARCHAR(220) NULL,
    [name] VARCHAR(160) NULL,
    [email] VARCHAR(200) NULL,
    [phone] VARCHAR(60) NULL,
    [department] VARCHAR(120) NULL,
    [responsibility] VARCHAR(200) NULL,
    [shift_date] VARCHAR(60) NULL,
    [shift_time] VARCHAR(60) NULL,
    [status] VARCHAR(30) NULL,
    [invite_token] VARCHAR(60) NULL,
    [notes] TEXT NULL,
    [created_at] DATETIME NULL,
    [skills] TEXT NULL,
    [availability] TEXT NULL,
    [venue] VARCHAR(200) NULL,
    [max_hours] INT NULL,
    [assigned_hours] FLOAT NULL,
    [completed_tasks] INT NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_webhook_deliveries] (
    [id] VARCHAR(36) NOT NULL,
    [webhook_id] VARCHAR(36) NULL,
    [event_type] VARCHAR(80) NULL,
    [payload] TEXT NULL,
    [idempotency_key] VARCHAR(120) NULL,
    [status] VARCHAR(20) NULL,
    [attempts] INT NULL,
    [response_code] INT NULL,
    [error] TEXT NULL,
    [created_at] DATETIME NULL,
    [delivered_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE TABLE [wm_webhooks] (
    [id] VARCHAR(36) NOT NULL,
    [event_id] VARCHAR(36) NULL,
    [url] VARCHAR(500) NOT NULL,
    [secret] VARCHAR(120) NULL,
    [events] TEXT NULL,
    [active] BIT NULL,
    [created_by] VARCHAR(36) NULL,
    [created_at] DATETIME NULL,
    PRIMARY KEY ([id])
)
GO

CREATE INDEX [ix_wm_achievements_event_id] ON [wm_achievements] ([event_id])
GO

CREATE INDEX [ix_wm_achievements_user_id] ON [wm_achievements] ([user_id])
GO

CREATE INDEX [ix_wm_attendance_logs_event_id] ON [wm_attendance_logs] ([event_id])
GO

CREATE INDEX [ix_wm_budget_categories_event_id] ON [wm_budget_categories] ([event_id])
GO

CREATE INDEX [ix_wm_budget_lines_event_id] ON [wm_budget_lines] ([event_id])
GO

CREATE INDEX [ix_wm_budget_lines_category_id] ON [wm_budget_lines] ([category_id])
GO

CREATE INDEX [ix_wm_certificates_event_id] ON [wm_certificates] ([event_id])
GO

CREATE UNIQUE INDEX [ix_wm_certificates_credential_id] ON [wm_certificates] ([credential_id]) WHERE [credential_id] IS NOT NULL AND [credential_id] <> ''
GO

CREATE INDEX [ix_wm_checkin_exceptions_event_id] ON [wm_checkin_exceptions] ([event_id])
GO

CREATE INDEX [ix_wm_event_approval_records_event_id] ON [wm_event_approval_records] ([event_id])
GO

CREATE INDEX [ix_wm_event_plans_user_id] ON [wm_event_plans] ([user_id])
GO

CREATE INDEX [ix_wm_events_org_id] ON [wm_events] ([org_id])
GO

CREATE UNIQUE INDEX [ix_wm_events_slug] ON [wm_events] ([slug]) WHERE [slug] IS NOT NULL AND [slug] <> ''
GO

CREATE INDEX [ix_wm_events_parent_event_id] ON [wm_events] ([parent_event_id])
GO

CREATE INDEX [ix_wm_feedback_event_id] ON [wm_feedback] ([event_id])
GO

CREATE UNIQUE INDEX [ix_wm_guest_access_token_hash] ON [wm_guest_access] ([token_hash]) WHERE [token_hash] IS NOT NULL AND [token_hash] <> ''
GO

CREATE INDEX [ix_wm_guest_access_event_id] ON [wm_guest_access] ([event_id])
GO

CREATE INDEX [ix_wm_hosting_requests_user_id] ON [wm_hosting_requests] ([user_id])
GO

CREATE INDEX [ix_wm_incidents_event_id] ON [wm_incidents] ([event_id])
GO

CREATE INDEX [ix_wm_jobs_event_id] ON [wm_jobs] ([event_id])
GO

CREATE INDEX [ix_wm_jury_assignments_event_id] ON [wm_jury_assignments] ([event_id])
GO

CREATE INDEX [ix_wm_mail_messages_to_email] ON [wm_mail_messages] ([to_email])
GO

CREATE INDEX [ix_wm_notifications_user_id] ON [wm_notifications] ([user_id])
GO

CREATE INDEX [ix_wm_offline_scans_event_id] ON [wm_offline_scans] ([event_id])
GO

CREATE INDEX [ix_wm_org_members_user_id] ON [wm_org_members] ([user_id])
GO

CREATE INDEX [ix_wm_org_members_org_id] ON [wm_org_members] ([org_id])
GO

CREATE UNIQUE INDEX [ix_wm_organizations_slug] ON [wm_organizations] ([slug]) WHERE [slug] IS NOT NULL AND [slug] <> ''
GO

CREATE INDEX [ix_wm_otp_codes_email] ON [wm_otp_codes] ([email])
GO

CREATE INDEX [ix_wm_payments_registration_id] ON [wm_payments] ([registration_id])
GO

CREATE INDEX [ix_wm_payments_user_id] ON [wm_payments] ([user_id])
GO

CREATE INDEX [ix_wm_payments_event_id] ON [wm_payments] ([event_id])
GO

CREATE INDEX [ix_wm_registrations_event_id] ON [wm_registrations] ([event_id])
GO

CREATE INDEX [ix_wm_registrations_user_id] ON [wm_registrations] ([user_id])
GO

CREATE UNIQUE INDEX [ix_wm_registrations_ticket_code] ON [wm_registrations] ([ticket_code]) WHERE [ticket_code] IS NOT NULL AND [ticket_code] <> ''
GO

CREATE INDEX [ix_wm_resource_bookings_session_id] ON [wm_resource_bookings] ([session_id])
GO

CREATE INDEX [ix_wm_resource_bookings_resource_id] ON [wm_resource_bookings] ([resource_id])
GO

CREATE INDEX [ix_wm_resource_bookings_event_id] ON [wm_resource_bookings] ([event_id])
GO

CREATE INDEX [ix_wm_resources_event_id] ON [wm_resources] ([event_id])
GO

CREATE INDEX [ix_wm_resources_venue_id] ON [wm_resources] ([venue_id])
GO

CREATE INDEX [ix_wm_result_releases_event_id] ON [wm_result_releases] ([event_id])
GO

CREATE INDEX [ix_wm_rubrics_event_id] ON [wm_rubrics] ([event_id])
GO

CREATE INDEX [ix_wm_schedule_conflicts_resource_id] ON [wm_schedule_conflicts] ([resource_id])
GO

CREATE INDEX [ix_wm_schedule_conflicts_fingerprint] ON [wm_schedule_conflicts] ([fingerprint])
GO

CREATE INDEX [ix_wm_schedule_conflicts_event_id] ON [wm_schedule_conflicts] ([event_id])
GO

CREATE INDEX [ix_wm_scores_submission_id] ON [wm_scores] ([submission_id])
GO

CREATE INDEX [ix_wm_scores_event_id] ON [wm_scores] ([event_id])
GO

CREATE INDEX [ix_wm_sessions_parent_event_id] ON [wm_sessions] ([parent_event_id])
GO

CREATE INDEX [ix_wm_sessions_venue_id] ON [wm_sessions] ([venue_id])
GO

CREATE INDEX [ix_wm_sessions_event_id] ON [wm_sessions] ([event_id])
GO

CREATE INDEX [ix_wm_sponsors_event_id] ON [wm_sponsors] ([event_id])
GO

CREATE INDEX [ix_wm_submissions_event_id] ON [wm_submissions] ([event_id])
GO

CREATE INDEX [ix_wm_tasks_assignee_id] ON [wm_tasks] ([assignee_id])
GO

CREATE INDEX [ix_wm_tasks_event_id] ON [wm_tasks] ([event_id])
GO

CREATE INDEX [ix_wm_tasks_session_id] ON [wm_tasks] ([session_id])
GO

CREATE UNIQUE INDEX [ix_wm_users_username] ON [wm_users] ([username]) WHERE [username] IS NOT NULL AND [username] <> ''
GO

CREATE UNIQUE INDEX [ix_wm_users_email] ON [wm_users] ([email])
GO

CREATE INDEX [ix_wm_venues_event_id] ON [wm_venues] ([event_id])
GO

CREATE INDEX [ix_wm_volunteers_event_id] ON [wm_volunteers] ([event_id])
GO

CREATE INDEX [ix_wm_webhook_deliveries_webhook_id] ON [wm_webhook_deliveries] ([webhook_id])
GO

CREATE INDEX [ix_wm_webhooks_event_id] ON [wm_webhooks] ([event_id])
GO

CREATE UNIQUE INDEX [uq_user_achievement] ON [wm_achievements] ([user_id], [dedupe_key]) WHERE [user_id] IS NOT NULL AND [user_id] <> '' AND [dedupe_key] IS NOT NULL AND [dedupe_key] <> ''
GO

CREATE UNIQUE INDEX [uq_wm_event_types_name] ON [wm_event_types] ([name])
GO

CREATE UNIQUE INDEX [uq_wm_jury_assignments_guest_token] ON [wm_jury_assignments] ([guest_token]) WHERE [guest_token] IS NOT NULL AND [guest_token] <> ''
GO

CREATE UNIQUE INDEX [uq_scan_client] ON [wm_offline_scans] ([event_id], [client_scan_id]) WHERE [event_id] IS NOT NULL AND [event_id] <> '' AND [client_scan_id] IS NOT NULL AND [client_scan_id] <> ''
GO

CREATE UNIQUE INDEX [uq_org_user] ON [wm_org_members] ([org_id], [user_id]) WHERE [org_id] IS NOT NULL AND [org_id] <> '' AND [user_id] IS NOT NULL AND [user_id] <> ''
GO

CREATE UNIQUE INDEX [uq_wm_payments_idempotency_key] ON [wm_payments] ([idempotency_key]) WHERE [idempotency_key] IS NOT NULL AND [idempotency_key] <> ''
GO

CREATE UNIQUE INDEX [uq_provider_ref] ON [wm_payments] ([provider], [provider_ref]) WHERE [provider] IS NOT NULL AND [provider] <> '' AND [provider_ref] IS NOT NULL AND [provider_ref] <> ''
GO

CREATE UNIQUE INDEX [uq_result_release] ON [wm_result_releases] ([event_id], [round]) WHERE [event_id] IS NOT NULL AND [event_id] <> '' AND [round] IS NOT NULL AND [round] <> ''
GO

CREATE UNIQUE INDEX [uq_wm_volunteers_invite_token] ON [wm_volunteers] ([invite_token]) WHERE [invite_token] IS NOT NULL AND [invite_token] <> ''
GO

CREATE UNIQUE INDEX [uq_hook_key] ON [wm_webhook_deliveries] ([webhook_id], [idempotency_key]) WHERE [webhook_id] IS NOT NULL AND [webhook_id] <> '' AND [idempotency_key] IS NOT NULL AND [idempotency_key] <> ''
GO

CREATE INDEX [ix_wm_events_visibility] ON [wm_events] ([visibility])
GO
