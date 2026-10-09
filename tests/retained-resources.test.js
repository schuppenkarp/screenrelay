import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetainedResources } from '../public/retained-resources.js';

function fixture() {
  const opened = [],
    closed = [];
  const pool = createRetainedResources({
    create(item) {
      const connection = { id: item.id };
      opened.push(connection);
      return connection;
    },
    attach(connection, target) {
      connection.location = target;
    },
    park(connection) {
      connection.location = 'background';
    },
    destroy(connection) {
      closed.push(connection);
    },
  });
  return { pool, opened, closed };
}
const camera = {
  id: 'camera',
  type: 'stream',
  url: '/api/streams/camera/live',
  stream_kind: 'reolink',
  visible: true,
};

test('rotation and touch view changes reuse a live connection until the camera is removed', () => {
  const { pool, opened, closed } = fixture();
  for (let turn = 0; turn < 10; turn++) {
    const release = pool.mount('visible tile', camera);
    pool.sync([camera]);
    release();
    assert.equal(opened[0].location, 'background');
  }
  assert.equal(opened.length, 1);
  assert.equal(closed.length, 0);
  pool.sync([]);
  assert.equal(closed.length, 1);
});

test('late transition cleanup does not detach a camera from its newer tile', () => {
  const { pool, opened, closed } = fixture();
  const oldRelease = pool.mount('old tile', camera);
  const newRelease = pool.mount('new tile', camera);
  oldRelease();
  assert.equal(opened[0].location, 'new tile');
  newRelease();
  assert.equal(opened[0].location, 'background');
  assert.equal(closed.length, 0);
});

test('disabled cameras, changed stream formats and logout close retained connections', () => {
  const { pool, opened, closed } = fixture();
  const release = pool.mount('tile', camera);
  pool.sync([{ ...camera, visible: false }]);
  release();
  assert.equal(closed.length, 1);
  pool.mount('tile', camera);
  pool.mount('tile', { ...camera, stream_kind: 'hls' });
  assert.equal(opened.length, 3);
  assert.equal(closed.length, 2);
  pool.clear();
  assert.equal(closed.length, 3);
});
