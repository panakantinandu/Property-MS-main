// Simple Socket.IO emitter singleton
let io;

module.exports = {
    set: (socketIo) => {
        io = socketIo;
    },
    get: () => io,
    emit: (event, data) => {
        if (io) io.emit(event, data);
    }
};
