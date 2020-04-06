import * as log from 'winston';

export interface CancellationToken
{
	readonly isCancellationRequested: boolean;
	ThrowIfCanceled(): void;
}

export class CancellationError extends Error
{
	constructor(message = "")
	{
		super(message);
		this.name = 'CancellationError';
	}
}

class TokenImpl implements CancellationToken
{
	private _isCancelled: boolean;
	constructor(isCancelled: boolean = false)
	{
		this._isCancelled = isCancelled;
	}

	public ThrowIfCanceled(): void
	{
		if (this.isCancellationRequested)
		{
			log.info("Cancelled requested" );
			throw new CancellationError();
		}
	}

	public cancel()
	{
		if (!this._isCancelled)
			this._isCancelled = true;
	}

	get isCancellationRequested(): boolean
	{
		return this._isCancelled;
	}
}

class TokenNone implements CancellationToken
{
	public ThrowIfCanceled(): void
	{
	}

	public cancel()
	{
	}

	get isCancellationRequested(): boolean
	{
		return false;
	}
}

export namespace CancellationToken
{
	export const None: CancellationToken = Object.freeze(new TokenNone());
	export const Cancelled: CancellationToken = Object.freeze(new TokenImpl(true));
}

export class CancellationTokenSource
{
	private _token: CancellationToken| undefined ;

	get token(): CancellationToken
	{
		if ( this._token === undefined )
			this._token = new TokenImpl();
		return this._token;
	}

	cancel(): void
	{
		if (this._token === undefined)
			this._token = CancellationToken.Cancelled;
		else if (this._token instanceof TokenImpl)
			this._token.cancel();
	}
}
