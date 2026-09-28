const Model = use('laranode/Database/Loquent/Model');

class ScheduledTaskRun extends Model {
    static table = 'scheduled_task_runs';
    static timestamps = false;
    static fillable = ['task', 'started_at', 'finished_at', 'status', 'summary'];
}

module.exports = ScheduledTaskRun;
