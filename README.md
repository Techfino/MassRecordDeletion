# MassRecordDeletion
Map / Reduce script designed to delete records in NetSuite safely and effectively

### How to Deploy
1.	Add the Map / Reduce and library files to the file cabinet
2.	Create a new Map / Reduce script
3.	Create a script parameter for the script with the id: ‘_tf_saved_search’ so the final name will be ‘custscript_tf_saved_search’
4.	Deploy the script setting the saved search under parameters and the concurrency to the desired amount. Keep in mind you need to set the saved search as “public” and have other visibility considerations (i.e. role) for it to be an option for the script parameter.

