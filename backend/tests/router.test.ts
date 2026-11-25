import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('returns task stats instead of treating stats as an id', async () => {
  const { app, repository } = setup();
  repository.list.mockResolvedValue([todo, { ...todo, completed: true }]);
  const response = await request(app).get('/api/todos/stats');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ total: 2, completed: 1, active: 1 });
  expect(repository.get).not.toHaveBeenCalled();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each(['abc', '0', '-1', '1.5'])('rejects invalid id %s with 422', async (id) => {
  const { app, repository } = setup();
  const response = await request(app).get(`/api/todos/${id}`);
  expect(response.status).toBe(422);
  expect(Array.isArray(response.body.detail)).toBe(true);
  expect(repository.get).not.toHaveBeenCalled();
});
it('gets a task by id', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(todo);
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
});
it('returns 404 when the task does not exist', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  repository.update.mockResolvedValue(null);
  repository.delete.mockResolvedValue(false);
  const expected = { detail: 'Task not found.' };
  const get = await request(app).get('/api/todos/9');
  const patch = await request(app).patch('/api/todos/9').send({ completed: true });
  const del = await request(app).delete('/api/todos/9');
  expect([get.status, patch.status, del.status]).toEqual([404, 404, 404]);
  expect([get.body, patch.body, del.body]).toEqual([expected, expected, expected]);
});
it('updates a task with the parsed fields', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue({ ...todo, completed: true });
  const response = await request(app).patch('/api/todos/1').send({ completed: true, title: ' New ' });
  expect(response.status).toBe(200);
  expect(response.body.completed).toBe(true);
  expect(repository.update).toHaveBeenCalledWith(1, { completed: true, title: 'New' });
});
it.each([{}, { title: '' }, { unknown: 1 }])('rejects invalid update input: %j', async (payload) => {
  const { app, repository } = setup();
  const response = await request(app).patch('/api/todos/1').send(payload);
  expect(response.status).toBe(422);
  expect(Array.isArray(response.body.detail)).toBe(true);
  expect(repository.update).not.toHaveBeenCalled();
});
it('deletes a task and returns 204', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(true);
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(204);
  expect(repository.delete).toHaveBeenCalledWith(1);
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
