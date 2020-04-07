# Tailored Videowiki 
## Project strcture:
- ### modules/shared/dbHandlers
	- Files in this directory should be the only place that interacts directly with the database *( think if we want to change the database altogether, we should only change the implementations in this directory )*.

- ### modules/shared/services:
	- All business logic should be contained in this directory. The only place from which we can access the dbHandlers.

- ### modules:
	- the main directory having all the modules of the app.
	- each module should consist of 3 main files, mainly the `routes.js` , `controller.js` and `index.js` which exposes the routes file. create others if necessary ( utils/helpers ).
	- modules should not interact with the dbHandlers directly, all business logic should reside in the services `modules/shared/services` directory.
- ### modules/shared/vendors
	- Third party dependencies ( queuing, websockets, storage ) abstractions

