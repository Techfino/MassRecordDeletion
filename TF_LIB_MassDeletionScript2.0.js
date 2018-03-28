/**
 * @NApiVersion 2.x
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
 *  This script serves as the central library for the mass delete script
 ******************************************************************************************/

define(['N/record', 'N/search', 'N/runtime'],
    function(record, search, runtime) {
        const MAX_PAGE_SIZE = 1000;
        // With small inputs this is shared and can be leveraged to cache things such as the search object
        var cache = {};

        /**
         * Stores the nlobjSearchObject and constants in the module itself to improve performance slightly as each
         * instance will have access to the cached value until the module is refreshed
         * @param  {nlobjSearchObject} searchObj A NetSuite saved search object
         * @return {void}               
         */
        function initializeCache(savedSearchId) {
            var searchObj = search.load({
                id: savedSearchId
            });

            cache.searchObj = searchObj.run();

           /* 
            * Governance for record types limits the number of records that can be deleted per queue. For simplicity either divide
            * into chunks of 100 or 10 depending on if its a custom record or not 
            */
           if (searchObj.searchType.indexOf('custrecord') !== -1) { // custom record
                cache.CHUNKS_PER_SEARCH = 10;
            } else {
            	cache.CHUNKS_PER_SEARCH = 100;
            }
        } 

        /**
         * Adds sorting to a search to reduce chances that paged data has incorrect results. Non sorted paged data can have
         * a non valid count without sorting documented in defect 474626. Values are still deleted in original order, this 
         * just ensures that the overall number returned from the API is valid
         * 
         * @param  {nlobjSearchObject} searchObj A NetSuite saved search object
         * @return {nlobjSearchObject}           The same NetSuite seach with sorting added if none previously existed
         */
        function defect474626Fix(searchObj) {
            var sortingColumnsFound = 0;
            var internalidSortIndex = null;
            // check if sorting columns exist
            for (var i = 0; i < searchObj.columns.length; i++) {
                if (searchObj.columns[i].sort !== 'NONE') {
                    sortingColumnsFound++;
                }
                // note if the internalid is a column  
                if (searchObj.columns[i].name === 'internalid') {
                    internalidSortIndex = i;
                }
            }

            // If no sorting was detected, add a sorting column
            if (sortingColumnsFound === 0) {
                if (internalidSortIndex !== null) { // if the internalid was noted above add sorting to it
                    searchObj.columns[internalidSortIndex].sort = search.Sort.ASC;
                } else { // if internalid was not notes, add a new column
                    searchObj.columns.push(search.createColumn({ name: 'internalid', sort: search.Sort.ASC }));
                }
            }

            return searchObj;
        }

        /**
         * Parses an error into a human readable error message
         * @param  {object} error Javascript or NetSuite Error object
         * @return {string}       Return the error message from the error object
         */
        function getErrorDetails(error) {

            try {
                if (error instanceof nlobjError) {
                    return error.message + ' \n' + error.stack;
                } else {
                    return error.toString();
                }
            } catch (e) {
                return 'Could not read Error.';
            }
        }

        return {
            cache: cache,
            defect474626Fix: defect474626Fix,
            getErrorDetails: getErrorDetails,
            initializeCache: initializeCache,
        };
    });