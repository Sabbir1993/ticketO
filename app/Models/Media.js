const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Media extends SoftDeletes(Model) {
    static table = 'media';
    static fillable = ['uuid', 'disk', 'path', 'visibility', 'original_name', 'mime', 'bytes', 'width', 'height', 'alt', 'checksum', 'purpose', 'uploaded_by', 'merchant_id'];
}

module.exports = Media;
