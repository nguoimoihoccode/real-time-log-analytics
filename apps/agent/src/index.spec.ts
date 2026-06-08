jest.mock('./tail', () => ({ tailFile: jest.fn() }));
jest.mock('./client', () => ({
  AgentClient: jest.fn().mockImplementation(() => ({ connect: jest.fn(), send: jest.fn(), close: jest.fn() })),
}));

describe('agent index', () => {
  it('defaults to Socket.IO root namespace URL', async () => {
    jest.resetModules();
    delete process.env.BACKEND_WS_URL;
    const { AgentClient } = await import('./client');

    await import('./index');

    expect(AgentClient).toHaveBeenCalledWith('http://localhost:3000');
  });
});
