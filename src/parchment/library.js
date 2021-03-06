/*

The Parchment Library
=====================

Copyright (c) 2008-2011 The Parchment Contributors
BSD licenced
http://code.google.com/p/parchment

*/

/*

TODO:
	Display a more specific error if one was given by the proxy

*/

(function(window, $){

var rtitle = /([-\w\s_]+)(\.[\w]+(\.js)?)?$/,
rjs = /\.js$/,
useDomStorage = !!window.localStorage,

// Launcher. Will be run by jQuery.when()
launch_callback = function( args )
{
	// Hide the load indicator
	$( '.load' ).detach();
	
	// Create a runner
	var runner = window.runner = new ( window[args.vm.runner] || Runner )(
		parchment.options,
		args.vm.engine
	),
	
	savefile = args.library.get_save_data();
	
	// Add the callback
	runner.toParchment = function( event ) { args.library.fromRunner( runner, event ); };
	
	// Load it up!
	runner.fromParchment({
		code: 'load',
		data: ( new parchment.lib.Story( args.storydata ) ).data
	});
	
	// Restore if we have a savefile
	if ( savefile )
	{
		runner.fromParchment({
			code: 'restore',
			data: file.base64_decode( savefile )
		});
	}
	// Restart if we don't
	else
	{
		runner.fromParchment({ code: 'restart' });
	}
};

// Callback to show an error if a VM's dependant scripts could be successfully loaded
// Currently not usable as errors are not detected :(
/*scripts_fail = function(){
	throw new FatalError( 'Parchment could not load everything it needed to run this story. Check your connection and try refreshing the page.' );
};*/
// A story file
parchment.lib.Story = IFF.subClass({
	// Parse a zblorb or naked zcode story file
	init: function parse_zblorb(data, story_name)
	{
		this.title = story_name;

		// Check for naked zcode
		// FIXME: This check is way too simple. We should look at
		// some of the other fields as well for sanity-checking.
		if (data[0] < 9)
		{
			//this.filetype = 'zcode';
			this._super();
			this.chunks.push({
				type: 'ZCOD',
				data: data
			});
			this.data = data;
		}
		
		// Check for naked glulx
		else if (IFF.text_from(data, 0) == 'Glul')
		{
			//this.filetype = 'glulx';
			this._super();
			this.chunks.push({
				type: 'GLUL',
				data: data
			});
			this.data = data;
		}
		
		// Check for potential zblorb
		else if (IFF.text_from(data, 0) == 'FORM')
		{
			this._super(data);
			if (this.type == 'IFRS')
			{
				// We have Blorb!
//				this.images = [];
//				this.resources = [];

				// Go through the chunks and extract the useful ones
				for (var i = 0, l = this.chunks.length; i < l; i++)
				{
					var type = this.chunks[i].type;
/*
					if (type == 'RIdx')
						// The Resource Index Chunk, used by parchment for numbering images correctly
						for (var j = 0, c = IFF.num_from(this.chunks[i].data, 0); j < c; j++)
							this.resources.push({
								usage: IFF.text_from(this.chunks[i].data, 4 + j * 12),
								number: IFF.num_from(this.chunks[i].data, 8 + j * 12),
								start: IFF.num_from(this.chunks[i].data, 12 + j * 12)
							});
*/
					// Parchment uses the first ZCOD/GLUL chunk it finds, but the Blorb spec says the RIdx chunk should be used
					if ( type == 'ZCOD' && !this.zcode )
					{
						this.data = this.chunks[i].data;
					}
					else if ( type == 'GLUL' && !this.glulx )
					{
						this.data = this.chunks[i].data;
					}
						
					else if (type == 'IFmd')
					{
						// Treaty of Babel metadata
						// Will most likely break UTF-8
						this.metadata = file.array_to_text(this.chunks[i].data);
						var metadataDOM = $(this.metadata);
						if (metadataDOM)
						{
							//this.metadataDOM = metadataDOM;

							// Extract some useful info
							if ($('title', metadataDOM))
								this.title = $('title', metadataDOM).text();
							if ($('ifid', metadataDOM))
								this.ifid = $('ifid', metadataDOM).text();
							if ($('release', metadataDOM))
								this.release = $('release', metadataDOM).text();
						}
					}
/*
					else if (type == 'PNG ' || type == 'JPEG')
						for (var j = 0, c = this.resources.length; j < c; j++)
						{
							if (this.resources[j].usage == 'Pict' && this.resources[j].start == this.chunks[i].offset)
								// A numbered image!
								this.images[this.resources[j].number] = new image(this.chunks[i]);
						}

					else if (type == 'Fspc')
						this.frontispiece = IFF.num_from(this.chunks[i].data, 0);
*/
				}

/*				if (this.zcode)
					this.filetype = 'ok story blorbed zcode';
				else
					this.filetype = 'error: no zcode in blorb';
*/			}
/*			// Not a blorb
			else if (this.type == 'IFZS')
				this.filetype = 'error: trying to load a Quetzal savefile';
			else
				this.filetype = 'error unknown iff';
*/		}
/*		else
			// Not a story file
			this.filetype = 'error unknown general';
*/	}
});

var create_story_cache = function() {
	var dbProvider  = window.indexedDB || window.mozindexedDB || window.webkitindexedDB || window.msindexedDB;
	if (!!dbProvider) {
		return new DbStoryCache(dbProvider);
	}
	return new DomStoryCache();
},

// Stores stories using indexedDB
DbStoryCache = Object.subClass({
	storycachekey: "STORY_CACHE",
	storydatakey: "STORY_DATA",
	dbname: "STORE_CACHE_DB",
	version: 1, // Increment this and "upgradeneeded" whenever the schema changes
	init: function (dbProvider) {
		this.dbProvider = dbProvider;
	},
	initializeCache: function() {
		var self = this,
        deferred = $.Deferred();
		
		// Allow subsequent calls to this API
		if (!self.db) {
	        var req = this.dbProvider.open(this.dbname, this.version);
			
			req.addEventListener("upgradeneeded", function (e) {
				var db = e.target.result;
				var storycache = db.createObjectStore(self.storycachekey, {keyName: "url"});
				storycache.createIndex("lastused", "lastused");
				var storydata = db.createObjectStore(self.storydatakey, {keyName: "url"});
			}, false);
			
			req.addEventListener("success", function (e) {
				self.db = e.target.result;
				deferred.resolve(self);
			}, false);
			
			req.addEventListener("error", function (e) {
				deferred.reject(e);
			}, false);
		} else {
			deferred.resolve(self);
		}
		
		return deferred.promise();
	},
	checkInitialize: function() {
		if (!this.db) throw "Cache is not initialized. Call initializeCache";
		return true;
	},
	add: function (url, title, data) {
		this.checkInitialize();
		var deferred = $.Deferred(),
		trans = this.db.transaction([this.storycachekey, this.storydatakey], "readwrite");
		
		// Use an extensible schema for the metadata
		trans.objectStore(this.storycachekey).put({ title: title, lastused: new Date() }, url);
		
		 // Don't need an extensible key for cached data, so the raw array is stored alone
		trans.objectStore(this.storydatakey).put(data, url);
		
		trans.addEventListener("complete", function (e) {
			if (trans.commit) trans.commit(); // Necessary for IE9
			deferred.resolve(data);
		});
		
		trans.addEventListener("error", function (e) {
			deferred.reject(e);
		}, false);
		
		return deferred.promise();
	},
	useStoryFromUrl: function (url) {
		this.checkInitialize();
		var deferred = $.Deferred(),
		trans = this.db.transaction([this.storycachekey, this.storydatakey], "readwrite");

		// Retrieve the binary story data
		var datareq = trans.objectStore(this.storydatakey).get(url);
		
		// Get metadata about the file, update its last used time
		var storycache = trans.objectStore(this.storycachekey);
		storycache.get(url).addEventListener("success", function (e) {
			if (e.target.result) {
				var newdata = e.target.result;
				newdata.lastused = new Date();
				storycache.put(newdata, url);
			}
		}, false)
		
		// Fires when the metadata has been retrieved and updated, and the story binary exists
		trans.addEventListener("complete", function (e) {
			if (trans.commit) trans.commit(); // Necessary for IE9
			if (datareq.result) { // Note that we don't actually verify metadata exists. If the user has the story, why worry?
				deferred.resolve(datareq.result);
			} else {
				deferred.reject(false);
			}
		});
		
		trans.addEventListener("error", function (e) {
			deferred.reject(e);
		}, false);
		
		return deferred.promise();
	},
	getStories: function (limit) {
		this.checkInitialize();
		var deferred = $.Deferred(),
		retval = [],
		trans = this.db.transaction([this.storycachekey], "readonly")
		
		var itemsFound = 0;
		trans.objectStore(this.storycachekey).index("lastused").openCursor(null, "prev").addEventListener("success", function (e) {
			var result = e.target.result;
			if (result) {
				itemsFound++;
				result.value.url = result.primaryKey;
				retval.push(result.value);
				if (!limit || itemsFound <= limit) {
					result.continue();
				}
			}
		}, false)
		
		trans.addEventListener("complete", function () {
			deferred.resolve(retval);
		}, false);
		
		trans.addEventListener("error", function (e) {
			deferred.reject(e);
		}, false)
		
		return deferred.promise();
	}
}),

// Story file cache
DomStoryCache = Object.subClass({
	maxsavedstories: 1,
	storycachekey: "STORY_CACHE",
	init: function() {
		if (!useDomStorage) return;
		var storylist;
		try {
			storylist = JSON.parse(window.localStorage[this.storycachekey]);
		} catch (e) {
			// Bail out if the locally stored data is incorrect
			return;
		}
		if (storylist.length > this.maxsavedstories) return;
		this.cachedstories = storylist;
	},
	initializeCache: function() {
		// This cache operates synchronously, but the interface is async.
		// Return deferreds to match the interface
		return this.getDummyDeferred(this); 
	},
	// Add a story to the cache
	add: function(url, title, data)
	{
		if (useDomStorage) {
			var newstory = {
				url: url,
				lastused: new Date(),
				title: title,
			};
			
			while (this.cachedstories.length >= this.maxsavedstories) {
				var discarded = this.cachedstories.pop();
				window.localStorage.removeItem(discarded.url);
			}
			
			try {
				window.localStorage[newstory.url] = JSON.stringify(data);
				this.cachedstories.unshift(newstory);
			} catch (e) {
				return this.getDummyDeferred(e, true)
			}
			
			this.update();
		}
		
		return this.getDummyDeferred(data);
	},
	getDummyDeferred: function(data, failed) {
		var deferred = $.Deferred();
		if (failed) {
			deferred.reject(data);
		} else {
			deferred.resolve(data);
		}
		return deferred.promise();
	},
	useStoryFromUrl: function(url)
	{
		for (var i = 0, len = this.cachedstories.length; i < len; i++) {
			var cachedstory = this.cachedstories[i];
			if (cachedstory.url === url) {
				cachedstory.lastused = new Date();
				this.update();
				var data;
				try {
					data = JSON.parse(window.localStorage[url])
				} catch (e) {
					return this.getDummyDeferred(e, true);
				}
				return this.getDummyDeferred(data);
			}
		}
		
		return this.getDummyDeferred(false, true);
	},
	getStories: function (limit) {
		var retval = limit ? this.cachedstories.slice(0, limit) : this.cachedstories;
		return this.getDummyDeferred(retval);
	},
	update: function() {
		this.cachedstories.sort(function (a, b) {
			// Put most recently used at the top of the list
			return b.lastused - a.lastused;
		});
		
		try {
			window.localStorage[this.storycachekey] = JSON.stringify(this.cachedstories);
		} catch (e) {
			// Cannot update the list of stories. It's possible that it's corrupt. Clear it out so the user can try again later
			window.localStorage.removeItem(this.storycachekey);
			for (var i = 0, len = this.cachedstories.length; i < len; i++) {
				window.localStorage.removeItem(this.cachedstories[i].url);
			}
		}
	},
	cachedstories: []
}),

// The Parchment Library class
Library = Object.subClass({
	// Set up the library
	init: function()
	{
		// Keep a reference to our container
		this.container = $( parchment.options.container );
		
		this.ui = new parchment.lib.UI( this );
	},
	
	// Load a story or savefile
	load: function( id )
	{
		var self = this,
		
		options = parchment.options,
		
		storyfile = urloptions.story,
		url,
		storyname,
		vm = urloptions.vm,
		i = 0;
		
		// Run the default story only
		if ( options.lock_story )
		{
			// Locked to the default story
			storyfile = options.default_story;

			if ( !storyfile )
			{
				throw new FatalError( 'Story file not specified' );
			}
		}
		// Load the requested story or the default story
		else if ( options.default_story || storyfile )
		{
			// Load from URL, or the default story
			storyfile = storyfile || options.default_story;
		}
		// Show the library
		else
		{
			return this.ui.load_panels();
		}
		
		// Hide the #about, until we can do something more smart with it
		$('#about').remove();
		
		// Show the load indicator
		$( 'body' ).append( self.ui.load_indicator );
		
		// Set up the key tracking local saved gamess
		self.savekey = storyfile + '-save';
		self.storyfile = storyfile;

		storyname = rtitle.exec( storyfile );
		self.storyname = storyname ? storyname[1] : "";
		
		// Change the page title
		if ( options.page_title )
		{
			window.document.title = storyname ? storyname[1] + " - Parchment" : "Parchment";
		}
		
		// Check the story cache first
		//if ( self.stories.url[url] )
		//	var story = self.stories.url[url];

		// We will have to download it
		//else
		//{
			// If a VM was explicitly specified, use it
			if ( vm )
			{
				vm = parchment.vms[ vm ];
			}
			// Otherwise test each in turn
			else
			{
				for ( ; i < parchment.vms.length; i++ )
				{
					if ( parchment.vms[i].match.test( storyfile ) )
					{
						vm = parchment.vms[i];
						break;
					}
				}
			}
			// Raise an error if we have no VM
			if ( !vm )
			{
				throw new FatalError( 'File type is not supported!' );
			}
			
			// Launch the story with the VM
			try
			{
				this.launch( vm, storyfile );
			}
			catch (e)
			{
				throw new FatalError( e );
			}
		//}
	},
	
	// Get all the required files and launch the VM
	launch: function( vm, storyfile )
	{
		var self = this,
		// Callback to show an error when the story file wasn't loaded
		story_get_fail = function(){
			throw new FatalError( 'Parchment could not load the story. Check your connection, and that the URL is correct.' );
			return false;
		},
		// Resort to downloading over AJAX if the local store fails
		try_ajax = function () {
			return $.ajax( storyfile, { dataType: 'binary' } )
				.pipe( function( data, textStatus, jqXHR )
				{
					// Store the downloaded file in local storage
					return self.stories.add(self.storyfile, self.storyname, jqXHR.responseArray).pipe(
					function (storydata) {
						return storydata;
					}, 
					function () {
						// If storage fails but download succeeds, return a succeeded
						// deferred to the chain so that the program executes anyway
						var alwaysSucceed = $.Deferred();
						alwaysSucceed.resolve(jqXHR.responseArray);
						return alwaysSucceed.promise();
					});
				});
		},
		// Load the story file
		actions = [
			self.stories.initializeCache()
			.pipe(function (cache) {
				return self.stories.useStoryFromUrl(storyfile);
			})
			// Try to download if the cache can't provide the story
			.pipe(function (storydata) { return storydata; }, try_ajax) 
			// Pass along the data if either download or cache succeeds. Abort if both fail
			.pipe(function (storydata) {
				return {
					library: self,
					vm: vm,
					storydata: storydata
				};
			}, story_get_fail)
		],
		
		// Get the scripts if they haven't been loaded already
		/* DEBUG */
			scripts = [$.Deferred()],
			script_callback = function()
			{
				if ( vm.files.length == 0 )
				{
					scripts[0].resolve();
					return;
				}
				var dependency = parchment.options.lib_path + vm.files.shift();
				if ( rjs.test( dependency ) )
				{
					$.getScript( dependency, script_callback );
				}
				// CSS
				else
				{
					parchment.library.ui.stylesheet_add( vm.id, dependency );
					script_callback();
				}
			},
		/* ELSEDEBUG
			scripts = [],
		/* ENDDEBUG */
		i = 0,
		dependency;
		
		if ( !vm.loaded )
		{
			vm.loaded = 1;
			
			/* DEBUG */
				script_callback();
			/* ELSEDEBUG
				while ( i < vm.files.length )
				{
					dependency = parchment.options.lib_path + vm.files[i++];
					// JS
					if ( rjs.test( dependency ) )
					{
						scripts.push( $.getScript( dependency ) );
					}
					// CSS
					else
					{
						this.ui.stylesheet_add( vm.id, dependency );
					}
				}
			/* ENDDEBUG */

			// Use jQuery.when() to get a promise for all of the scripts
			actions[1] = $.when.apply( 1, scripts );
				//.fail( scripts_fail );
		}
		
		// Add the launcher callback
		$.when.apply( 1, actions )
			.done( launch_callback );
	},
	
	// An event from a runner
	fromRunner: function( runner, event )
	{
		var code = event.code;
		
		if ( code == 'save' )
		{
			var savedata = file.base64_encode( event.data ),
				retry = 2,
				succeeded = false;
			
			while (useDomStorage && retry) {
				try {
					// Normally we should turn anything that goes into localStorage into JSON.
					// But, this is already a string
					window.localStorage[this.savekey] = savedata;
					succeeded = true;
					break;
				} catch (e) {
					// Not enough space to save the game. Make room by deleting all other saves
					var shouldClear = confirm("We don't have enough room to save your game. Would you like to clear all saved games (for any story) and try again?");
					if (shouldClear) {
						window.localStorage.clear();
						retry--;
					} else {
						// Don't try again. This will cause a hash to be used for saving
						retry = 0;
					}		
				}
			}
			
			// Save as hash if local storage isn't allowed or not working
			if (!useDomStorage || !succeeded) {
				location.hash = savedata;
			}
		}
		
		if ( code == 'restore' )
		{
			var savefile = this.get_save_data();
			if ( savefile )
			{
				event.data = file.base64_decode( savefile );
			}
		}
		
		runner.fromParchment( event );
	},
	
	// Restores a save if available
	get_save_data: function() 
	{
		// First, default to using a hash file (in case you have a link), then try DOM storage
		var savefile = location.hash.slice( 1 );
		if ( !savefile && useDomStorage ) {
			savefile = window.localStorage[this.savekey];
		}
		return savefile;
	},
	
	// Loaded stories and savefiles
	stories: create_story_cache()
});

parchment.lib.Library = Library;

// VM definitions
parchment.vms = [];
parchment.add_vm = function( defn )
{
	parchment.vms.push( defn );
	parchment.vms[defn.id] = defn;
};

})(window, jQuery);