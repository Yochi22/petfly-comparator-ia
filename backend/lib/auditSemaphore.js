class AuditSemaphore {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }

  acquire(timeoutMs) {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }

    return new Promise((resolve, reject) => {
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => {
        this.queue = this.queue.filter(item => item !== entry);
        const error = new Error('La auditoría esperó demasiado tiempo en la cola. Intenta nuevamente.');
        error.statusCode = 503;
        reject(error);
      }, timeoutMs);
      this.queue.push(entry);
    });
  }

  createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(this.createRelease());
      } else {
        this.active -= 1;
      }
    };
  }
}

module.exports = { AuditSemaphore };
