/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope public
 */

/******************************************************************************************
 * Copyright (c) 2014-2018 Techfino, LLC
 * 2020 Federal Street, Philadelphia, PA 19146, USA
 * All Rights Reserved.
 *
 * This software is the confidential and proprietary information of Techfino LLC.  
 * ("Confidential Information") - You shall not disclose such Confidential Information 
 * without prior written permission.
 *
 * Script Description: 
 *  This script deletes records based off of Saved Search inputs
 ******************************************************************************************/

define(['N/search', 'N/record', 'N/task', 'N/runtime', 'N/file', './TF_LIB_MassDeletionScript2.0'],
    function(search, record, task, runtime, file, Dlib) {
        const MAX_PAGE_SIZE = 1000;


        return {
            /**
             * Obtains the saved search used and metes out page ranges to the map stage to concurrently search. Less straight forward but
             * prevents timeout for larger searches
             */
            getInputData: function() {

                try {

                    log.audit({ title: 'START', details: '<--------------------------------START-------------------------------->' });

                    var currentScript = runtime.getCurrentScript();
                    var savedSearchId = currentScript.getParameter('custscript_tf_saved_search');
                    var input = [];

                    if (savedSearchId) {
                        var searchObj = search.load({
                            id: savedSearchId
                        });

                        searchObj = Dlib.defect474626Fix(searchObj);
                        searchObj = searchObj.runPaged({
                            pageSize: MAX_PAGE_SIZE
                        });

                        var pageCount = searchObj.pageRanges.length;
                        for (var pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                            input.push({ searchId: savedSearchId, pageIndex: pageIndex });
                        }

                        log.audit({ title: '# Records to be deleted', details: searchObj.count });
                    }

                    return input;

                } catch (errorObj) {
                    log.error({ title: '(getInputData) Search Distribution Error', details: Dlib.getErrorDetails(errorObj) });
                }

            },

            /**
             * Searches for a page range of the search specified in the GetInputStage and distributes to reduce for deletion
             * @param  {[type]} context [description]
             * @return {[type]}         [description]
             */
            map: function(context) {
                try {
                    var CHUNKS_PER_SEARCH;
                    var mapValue = JSON.parse(context.value);

                    var searchLoadObj = search.load({
                        id: mapValue.searchId
                    });

                    searchObj = searchLoadObj.run();

                    /* 
                     * Governance for record types limits the number of records that can be deleted per queue. For simplicity either divide
                     * into chunks of 100 or 10 depending on if its a custom record or not 
                     */
                    if (searchLoadObj.searchType.indexOf('custrecord') !== -1) { // custom record
                        CHUNKS_PER_SEARCH = 10;
                    } else {
                        CHUNKS_PER_SEARCH = 100;
                    }

                    var start = (Number(mapValue.pageIndex) * MAX_PAGE_SIZE);
                    var end = start + 1000;

                    var deletePage = searchObj.getRange({
                        start: start,
                        end: end
                    });

                    for (var dIndex = 0; dIndex < deletePage.length; dIndex++) {
                        context.write({
                            key: mapValue.pageIndex + '-' + (dIndex % CHUNKS_PER_SEARCH),
                            value: { recordId: deletePage[dIndex].id, recordType: deletePage[dIndex].recordType }
                        });
                    }

                } catch (errorObj) {
                    log.error({ title: '(Map) Search Distribution Error', details: Dlib.getErrorDetails(errorObj) });
                    throw errorObj;
                }
            },

            /**
             * Deletes records found in the map stage. Records any errors
             */
            reduce: function(context) {
                try {

                    var recordsToDelete = context.values;
                    var errorArray = [];
                    for (var dIndex = 0; dIndex < recordsToDelete.length; dIndex++) {
                        var recordToDelete = JSON.parse(recordsToDelete[dIndex]);
                        var recordType = recordToDelete.recordType;
                        var recordId = recordToDelete.recordId;

                        try {
                            if (recordType !== 'file') {
                                record.delete({ type: recordType, id: recordId });
                            } else {
                                file.delete({
                                    id: recordId
                                });
                            }
                        } catch (errorObj) {
                            errorArray.push('(Reduce) Deletion Error for ' + recordType + ' ' + recordId + ': ' + Dlib.getErrorDetails(errorObj));
                        }

                    }

                    if (errorArray.length > 0) {
                        throw errorArray.join(',');
                    }

                } catch (errorObj) {
                    log.error({ title: '(Reduce) Deletion Error', details: Dlib.getErrorDetails(errorObj) });
                    throw errorObj;
                }
            },

            /**
             * Details summary information
             */
            summarize: function(summary) {
                try {

                    var scriptErrors = [];
                    log.audit({ title: 'summary', details: JSON.stringify(summary.inputSummary) });
                    if (summary.inputSummary.error !== null) {
                        scriptErrors.push(JSON.stringify(JSON.parse(summary.inputSummary.error).cause));
                    }

                    summary.mapSummary.errors.iterator().each(function(key, value) {
                        scriptErrors.push(JSON.stringify(JSON.parse(value).cause));
                        return true;
                    });

                    summary.reduceSummary.errors.iterator().each(function(key, value) {
                        scriptErrors.push(JSON.stringify(JSON.parse(value).cause));
                        return true;
                    });

                    if (scriptErrors.length > 0) {
                        log.error({ title: scriptErrors.length + ' error(s) occured during script execution', details: scriptErrors.join('\n') });
                    } else {
                        log.audit({ title: 'summary', details: 'Script finished execution without errors' });
                    }

                    var currentScript = runtime.getCurrentScript();
                    var savedSearchId = currentScript.getParameter('custscript_tf_saved_search');
                    var searchObj = search.load({
                        id: savedSearchId
                    });
                    searchObj = Dlib.defect474626Fix(searchObj);
                    searchObj = searchObj.runPaged({ pageSize: MAX_PAGE_SIZE });

                    log.audit({ title: '# of records that could not be deleted', details: searchObj.count });
                    log.audit({ title: 'Map Time Total (seconds)', details: summary.mapSummary.seconds });
                    log.audit({ title: 'Reduce Time Total (seconds)', details: summary.reduceSummary.seconds });
                    log.audit({ title: 'Max Concurrency Utilized ', details: summary.reduceSummary.concurrency });
                    log.audit({ title: 'END', details: '<---------------------------------END--------------------------------->' });
                } catch (errorObj) {
                    log.error({ title: '(Summary) Deletion Error', details: Dlib.getErrorDetails(errorObj) });
                }
            }
        };
    });