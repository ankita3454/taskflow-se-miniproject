-- CreateTable
CREATE TABLE "task_creation_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "task_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_creation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_creation_requests_task_id_key" ON "task_creation_requests"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_creation_requests_user_id_key_key" ON "task_creation_requests"("user_id", "key");

-- AddForeignKey
ALTER TABLE "task_creation_requests" ADD CONSTRAINT "task_creation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_creation_requests" ADD CONSTRAINT "task_creation_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE CASCADE ON UPDATE CASCADE;
