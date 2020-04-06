
/*
describe('Testing gui', () =>
{
	let app:Spectron.Application ;
	const rootPath = path.join(__dirname, '..');
	const electronPath = path.join( rootPath , "node_modules", ".bin", "electron") + ".cmd";
	const appPath = path.join( rootPath , "dist" , "src" , "main.js");

	beforeAll(function () {
		app = new Spectron.Application({
		  path: electronPath,
		  args: [appPath]
		})
		return app.start()
	  })

	  afterAll( () =>
	  {
		if ( app && app.isRunning())
		{
		  return app.stop()
		}
	  })

	it('trivial test', async () =>
	{
		//given
		const clientCount = await app.client.getWindowCount();

		//when

		//then
		expect(clientCount).toEqual(1);
	});

});
*/