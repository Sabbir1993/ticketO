const { create, drop, unique, index, col } = use('App/Support/Migration');

// Framework queue tables (shape expected by laranode DatabaseQueue). Job payloads must never
// contain secrets — pass ids and let the job load what it needs.
class CreateQueueTables {
    async up() {
        await create('jobs', [
            col.id,
            'queue VARCHAR(100) NOT NULL',
            'payload LONGTEXT NOT NULL',
            'attempts INT UNSIGNED NOT NULL DEFAULT 0',
            'reserved_at INT UNSIGNED NULL',
            'available_at INT UNSIGNED NOT NULL',
            'created_at INT UNSIGNED NOT NULL',
            index('ix_jobs_queue', 'queue', 'available_at'),
        ]);
        await create('failed_jobs', [
            col.id,
            'uuid VARCHAR(64) NOT NULL',
            'connection VARCHAR(100) NOT NULL',
            'queue VARCHAR(100) NOT NULL',
            'payload LONGTEXT NOT NULL',
            'exception LONGTEXT NOT NULL',
            'failed_at DATETIME NOT NULL',
            unique('uq_failed_jobs_uuid', 'uuid'),
        ]);
        await create('scheduled_task_runs', [
            col.id,
            'task VARCHAR(80) NOT NULL',
            'started_at DATETIME(3) NOT NULL',
            'finished_at DATETIME(3) NULL',
            "status ENUM('running','ok','failed') NOT NULL DEFAULT 'running'",
            'summary VARCHAR(255) NULL',
            index('ix_scheduled_task_runs', 'task', 'started_at'),
        ]);
    }

    async down() {
        await drop('scheduled_task_runs', 'failed_jobs', 'jobs');
    }
}

module.exports = CreateQueueTables;
