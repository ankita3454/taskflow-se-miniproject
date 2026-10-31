CREATE TYPE "InvitationStatus" AS ENUM ('Pending', 'Accepted', 'Declined');

CREATE TABLE "project_invitations" (
    "invitation_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "invited_email" VARCHAR(150) NOT NULL,
    "invited_by" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_invitations_pkey" PRIMARY KEY ("invitation_id")
);

CREATE INDEX "project_invitations_invited_email_status_idx"
    ON "project_invitations"("invited_email", "status");
CREATE INDEX "project_invitations_project_id_status_idx"
    ON "project_invitations"("project_id", "status");
CREATE UNIQUE INDEX "project_invitations_pending_project_email_key"
    ON "project_invitations"("project_id", "invited_email")
    WHERE "status" = 'Pending';

ALTER TABLE "project_invitations"
    ADD CONSTRAINT "project_invitations_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("project_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_invitations"
    ADD CONSTRAINT "project_invitations_invited_by_fkey"
    FOREIGN KEY ("invited_by") REFERENCES "users"("user_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
