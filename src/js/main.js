// MP = Member of Parliament

/**
 * MODEL module - handles app logic & data
 */
const MODEL = (function() {
    var allMPs = [];
    var filteredMPs = [];
    var loaded = 0;

    /**
     * Returns all MPs
     * Originally fetched from: http://data.riksdagen.se/personlista/?iid=&fnamn=&enamn=&f_ar=&kn=&parti=&valkrets=&rdlstatus=&org=&utformat=json&termlista=
     * Currently fetched locally since it's very big and doesn't change very often.
     */
    function fetchAllMPs() {
        return fetch('json/rawMPs.json')
            .then(handleFetchErrors)
            .then(response => response.json())
            .then(data => slimArray(data))
            .catch(error => console.log(error));
    }

    function handleFetchErrors(response) {
        if (!response.ok) {
            throw Error(response.statusText);
        }
        return response;
    }

    /**
     * CAN BE DONE WITH MAP, DUMMY
     * Returns a slimmer array of MP:s with the props i need
     * @param {array} mps - original raw array of MP:s
     */
    function slimArray(mps) {
        let mp = mps.personlista.person;
        for (let i in mp) {
            allMPs.push({
                id: mp[i].intressent_id,
                firstname: mp[i].tilltalsnamn,
                lastname: mp[i].efternamn,
                party: mp[i].parti,
                gender: mp[i].kon,
                born: mp[i].fodd_ar,
                electorate: mp[i].valkrets,
                image: mp[i].bild_url_192
            });
        }
        fetchDebates(allMPs);
    }

    function fetchDebates(mps) {
        var fetchObj;
        //let fromDate = MODEL.oneMonthBack();
        //If I want all of Riksmöte 16/17
        let fromDate = "";
        let countComebacks = 'Ja';

        for (let i in mps) {
            fetchObj = fetch(`http://data.riksdagen.se/anforandelista/?rm=2016%2F17&anftyp=${countComebacks}&d=${fromDate}&ts=&parti=&iid=${mps[i].id}&sz=200&utformat=json`)
                .then(handleFetchErrors)
                .then(response => response.json())
                .then(data => addSpeechToArray(data, i))
                .catch(error => console.log(error));
        }
        // Fetch is done, we're ready to store array and send to print
        fetchObj.then(function() {
            CONTROLLER.storeArray(allMPs, 'all');
        });
    }

    function addSpeechToArray(data, i) {
        allMPs[i].numberofspeeches = parseInt(data.anforandelista['@antal']);
        if (data.anforandelista['@antal'] !== '0') {
            allMPs[i].speeches = data.anforandelista.anforande;
            console.log('getting speeches');
            loaded += 1;
            increaseProgressbar();
        }
    }

    /**
     * Translates the values of fetched speech-lists, translates them to percent and appends them to the 
     * progress-bar on page. Should really be done in VIEW...
     */
    function increaseProgressbar() {
        let percent = Math.round((loaded / 349) * 100);
        let progress = document.querySelector(".progress-bar");
        progress.innerHTML = percent + "%";
        progress.style.width = percent + "%";
        progress.setAttribute("aria-valuenow", percent);
    }

    /**
     * Sorts the array passed in by value of the given prop. To sort toplist + chart.
     * * @param {array} arr - array to be sorted
     * * @param {string} prop - property to sort
     */
    function sortNumberOfSpeeches(arr, prop) {
        return arr.filter(function(val) {
            //Ajax async sometimes cause undefined values to turn up on the toplist. As for now i am simply removing that mp + logging it.
            //Better than to set their speech rate to 0 as that effects the party stats negatively.
            if (isNaN(val[prop])) console.log("filter removed an undefined", val);
            return (!isNaN(val[prop]));
        }).sort((a, b) => a[prop] > b[prop] ? -1 : 1);
    }

    /**
     * calcs the total number of speeches in the array recieved and returns the number.
     */
    function totalSpeeches(mps) {
        //for safety, filters out any "undefined" values from the array to avoid a NaN total.
        return mps.filter((val) => {
            return (!isNaN(val.numberofspeeches));

        }).reduce((total, cur) => {
            return total + cur.numberofspeeches;

        }, 0);
    }

    /**
     * Before I can print the chart, I need to format data in a way that Chartist.js accepts.
     * * @param {array} indata - the chart data to be formatted
     */
    function formatChartObj(indata) {
        // template object
        var data = {
            labels: [],
            series: [
                []
            ]
        };
        // since Chartist don't support setting bar colors via the API, Im adding a meta tag and append
        // the corresponding class to the SVG element later on draw..phew
        indata.forEach(function(element) {
            data.labels.push(element.label);
            data.series[0].push({ value: element.quota, className: 'bar-' + element.label });
        }, this);
        return data;
    }

    return {

        /**
         * Retrieves the array of MP:s from the model.
         *  * @param {string} which - Either all or a current selection depending on request.
         */
        getArray: function(which) {
            return which === 'all' ? allMPs : filteredMPs;
        },

        /**
         * Sorts and stores the array of MP: in the model.
         * * @param {array} mps - array of mp:s to store.
         * * @param {string} which - store all or current selection depending on request.
         */
        setArray: function(mps, which) {
            let sorted = sortNumberOfSpeeches(mps, 'numberofspeeches');
            return which === 'all' ? allMPs = sorted : filteredMPs = sorted;
        },

        initMPObject: function() {
            fetchAllMPs();
        },

        /**
         * REVERTS CURRENT DATE ONE MONTH. NEEDS REMAKE (DEC BECOMES -1 INST OF 12)
         */
        oneMonthBack: function() {
            let date = new Date();
            return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        },

        /**
         * I have to filter out my huge array on the basis of another array of selections.
         * Array.Some is helpful here since it looks for any occurance in the other array.
         * * @param {array} lookingfor - array of strings that I want to filter
         * * @param {string} prop - the property that i want to target
         */
        filterMPs: function(lookingfor, prop) {
            let all = MODEL.getArray('all');
            let filtered = all.filter((mp) => {
                return lookingfor.some((thing) => {
                    return thing === mp[prop];
                });
            });
            return filtered;
        },

        /**
         * Returns an array of objects with the total number of speeches by a certain category (party/gender).
         * Also the number of members in that category and the quota of the two.
         * * @param {string} prop - I want to sum the values in this property
         */
        sumSpeechesBy: function(prop) {
            let temp = [];
            var categories = [];
            if (prop == 'party') {
                categories = ['S', 'V', 'MP', 'M', 'L', 'C', 'KD', 'SD', '-'];
            }

            if (prop == 'gender') {
                categories = ['man', 'kvinna'];
            }
            // no need to count the total?
            // let all = MODEL.getArray("all");
            // let total = totalSpeeches(all);

            categories.forEach(function(category) {
                let numMps = MODEL.filterMPs([category], prop).length;
                let numSpeeches = totalSpeeches(MODEL.filterMPs([category], prop));

                temp.push({
                    label: category,
                    mps: numMps,
                    speeches: numSpeeches,
                    quota: Math.round((numSpeeches / numMps) * 100) / 100
                });
            });
            temp = sortNumberOfSpeeches(temp, 'quota');
            const result = formatChartObj(temp);
            return result;
        },

        /**
         * Gets the XML of individual speeches on request.
         * Since Fetch doesn't handle XML, I'm doing this the oldfashoned way.
         * * @param {object} speechobj - the object containing link to speech text
         * * @param {function} callback - for returning the result to the caller function. 
         */
        getSpeech: function(speechobj, callback) {
            var req = new XMLHttpRequest();
            req.onreadystatechange = function() {
                if (this.readyState == 4 && this.status == 200) {
                    let doc = req.responseXML;
                    let speech = doc.getElementsByTagName("anforandetext")[0].childNodes[0].nodeValue;
                    callback(speech);
                }
            };
            req.open("GET", speechobj.anforande_url_xml, true);
            req.send();
            req.addEventListener("error", () => console.log("Fel när anförandet skulle hämtas", req.statusText));
        }
    };
})();

/**
 * CONTROLLER module - directs communication
 */
const CONTROLLER = (function() {
    /**
     * gets the right (type) of array and then sends it to print.
     * Hides all other sections. Cause it's kind of a hub, it also console.logs some stuff.
     * @param {string} type - what to print all or filtered list
     */
    function prepareToPrintToplist(type) {
        let toPrint = MODEL.getArray(type);
        if (toPrint.length === 0) console.log('control says: Array came back empty from storage');
        else console.log('To print:', toPrint);

        VIEW.hideAllButMe('toplist-section');
        VIEW.printTopList(toPrint);
    }

    return {

        /**
         * Inits on page load. Triggers the loading-section
         */
        init: function() {

            //VIEW.hideAllButMe('loading-section');
            MODEL.initMPObject();
        },

        /**
         * Stores and sends to print the (right type) array
         * * @param {array} mps - the array of MPs
         * * @param {string} type - in which array to store - "all" or "filtered"
         */
        storeArray: function(mps, type) {
            MODEL.setArray(mps, type);
            prepareToPrintToplist(type);
        },

        /**
         * Gets sent an element that was clicked in the nav bar.
         * Depening on which one, the right function runs and all other sections are hidden.
         */
        navClick: function() {
            // switch case could be used here
            let clicked = this.firstChild.nodeValue;

            if (clicked == 'Topplistan') {
                prepareToPrintToplist('all');
            }

            if (clicked == 'Om') {
                VIEW.hideAllButMe('about-section');
            }

            if (clicked == 'Partitoppen') {
                let votesbyParty = MODEL.sumSpeechesBy('party');
                // adding a string as caller id. both charts use the same method, but I need to create separate charts.
                VIEW.printChart(votesbyParty, 'partyChart');
                VIEW.hideAllButMe('party-chart-section');
            }
            if (clicked == 'Könsfördelning') {
                let votesByGender = MODEL.sumSpeechesBy('gender');
                VIEW.printChart(votesByGender, 'genderChart');
                VIEW.hideAllButMe('gender-chart-section');
            }
        },

        /**
         * Extracts the strings from the active buttons - i.e the names of parties I want to filter out.
         * These are pushed to an array and then sent to filterMPs - returning the mp-objects that match.
         * Then sent to storage.
         * * @param {nodeList} elems - the list of toggle buttons for filtering parties.
         */
        getPartySelection: function(elems) {
            let selection = [];
            elems.forEach((element) => {
                if (element.classList.contains('activeParty')) {
                    selection.push(element.firstChild.nodeValue);
                }
            });
            let filtered = MODEL.filterMPs(selection, 'party');
            CONTROLLER.storeArray(filtered, 'filtered');
        },

        /**
         * Triggers a modal window for the MP klicked. Sudden jQuery-syntax comes from Bootstrap documentation.
         */
        openModal: function(event, mp) {
            VIEW.printModal.call(mp);
            VIEW.showModalSection("modal-speech-list");
            $('#mpModal').modal();
        },

        /**
         * gets the speech text from ajax/model function and sends it back for display along with the right object
         */
        openSpeech: function(event, speechObj) {
            MODEL.getSpeech(speechObj, function(xml) {
                var result = xml;
                VIEW.printSpeech(result, speechObj);
            });

        }
    };
})();


/**
 * VIEW module - Handles everything u see & interact with
 */
const VIEW = (function() {
    /**
     * It was a nightmare to figure out how to append event listerners to all the toplist items. I tried every possible closure to get
     * not only the last one to stick. Turns out the problem was probably the DOM selector operating in the same
     * loop as the template literal? As soon as i made ANOTHER loop everything just worked :/
     * @param {array} mps
     */
    function listenersForToplist(mps) {
        for (let i in mps) {
            document.querySelector(`tr[data-id="${mps[i].id}"]`).
            addEventListener('click', CONTROLLER.openModal.bind(null, event, mps[i]));
        }
    }

    /**
     * Making speeches clickable
     * @param {array} speeches - array of speeches that is printed in the modal
     */
    function listenersForSpeeches(speeches) {
        for (let i in speeches) {
            document.getElementById(speeches[i].anforande_id).
            addEventListener('click', CONTROLLER.openSpeech.bind(null, event, speeches[i]));
        }
    }

    /**
     * You can often remove a lot of things in these topic descriptions. For ex "svar på interpellation 1235 om..." after the "om" follows
     * the real issue, so i extract everything after the "om", capitalize the first letter and return.
     * @param {string} string - topic of the speech
     */
    function trimString(string) {
        let newString = string;
        let search = newString.indexOf(' om ');
        if (search > 0) {
            let temp = newString.substring(search + 4, newString.length);
            temp = capitalizeFirst(temp);
            newString = temp;
        }
        return newString;
    }

    /**
     * capital first letter of a string
     */
    function capitalizeFirst(str) {
        if (str) {
            str = str[0].toUpperCase() + str.substring(1, str.length);
        }
        return str;
    }

    /**
     * Makes a template literal string of speeches and append it to <ul> in the modal.
     * The pass these speeches along to make event listerners for them
     */
    function printSpeechList() {
        let ul = document.getElementById('modal-speech-list'),
            speechArr = [],
            string = '',
            count = 0;
        const sp = this.speeches,
            eMega = '<i class="em em-mega"> </i>',
            eSpeech = '<i class="em em-speech_balloon"> </i>';

        // no speeches
        if (!sp) return '<i class="em em-disappointed"></i>';

        for (let i in sp) {
            // if the previous debate was the same as this one, then skip it...
            // the loose compare is important since it accepts "0".
            if (i == 0 || sp[i].avsnittsrubrik !== sp[i - 1].avsnittsrubrik) {
                string += `<li> 
                            <span class="${sp[i].replik == 'Y' ? 'comeback' : 'own'}-debate debate-topic" id="${sp[i].anforande_id}">
                            ${trimString(sp[i].avsnittsrubrik)}</span>
                            <span class="debate-context">${capitalizeFirst(sp[i].kammaraktivitet) || '' } ${sp[i].dok_datum}.</span> 
                            `;
                count++;

                // If the next topic will be a new one, close the list item.
                if (i > sp.length - 1 && sp[i].avsnittsrubrik !== sp[i + 1].avsnittsrubrik) string += '</li>';

                // ... instead print out an emoji
            } else string += `<i id="${sp[i].anforande_id}" class="em em-${sp[i].replik == 'Y' ? 'speech_balloon' : 'mega'}"></i>`;

            speechArr.push(sp[i]);
            if (count === 10) break;
        }
        // can's just return the string to parent function because then the event listeners be created before the elements = fail.
        ul.innerHTML = string;
        listenersForSpeeches(speechArr);
    }

    /**
     * HTML-page consists of 3 sections that corresponds to three
     * features of the page: to print a toplist, to display a chart and to display an about-text (+loading).
     * Following three functions print these sections using helper methods.
     */

    return {

        printTopList: function(mps) {
            let toplist = document.getElementById("toplist");
            const toplistRight = document.getElementById("toplist2");
            const max = 10;
            // make a new arr of the items printed so I can add event listeners for them
            const toplistArr = [];

            toplist.innerHTML = "";
            toplistRight.innerHTML = "";

            if (mps.length === 0) {
                toplist.innerHTML = "<p>Oops, det finns ingen data att visa</p>";
                return;
            }
            // keep printing the toplist until you reach the end of arr OR max value.
            for (let i = 0; i < max && i < mps.length; i++) {

                //append place 5-10 to the second table
                if (i >= 5) {
                    toplist = toplistRight;
                }
                toplist.innerHTML += `
                <tr data-id="${mps[i].id}">
                    <th scope="row">${i + 1}</th>
                    <td class="td-img">
                        <div class="mp-img-container border-${mps[i].party}">
                            <img src="${mps[i].image}" class="mp-img" alt="${mps[i].firstname} ${mps[i].lastname}">
                        </div>
                    </td>
                    <td>${mps[i].firstname} ${mps[i].lastname} (${mps[i].party})</td>
                    <td class="td-right">${mps[i].numberofspeeches}</td>
                </tr>
                `;
                toplistArr.push(mps[i]);
            }
            listenersForToplist(toplistArr);
        },

        /**
         *
         * * @param {object} data - data to be displayed in the chart
         * * @param {string} which - are we creating gender/party chart?
         * Chart itself is made in chart_animation.js
         */
        printChart: function(data, which) {
            console.log("print chart:", data);

            if (which === 'partyChart') {
                CHART.makePartyChart(data);
            }
            if (which === 'genderChart') {
                CHART.makeGenderChart(data);
            }
        },

        /**
         * Prints a modal that pop up when you click an MP.
         */
        printModal: function() {
            let modalHeading = `${this.firstname} ${this.lastname} (${this.party})`;

            let hasSpeeches = this.speeches ?
                `<br>Nedan visas de senaste tillfällena. Klicka för att läsa vad ${this.gender == 'man' ? 'han' : 'hon'} sade.</p>` :
                '<br>Därför finns det inget att visa här.</p>';

            let modalFacts = `
                <p>Född: ${this.born}. Valkrets: ${this.electorate}.</p>
                <p>${this.firstname} har debatterat i Riksdagen ${this.numberofspeeches} gånger sedan ${MODEL.oneMonthBack()}. 
                ${hasSpeeches}
                `;

            document.getElementById("mpModalLabel").innerHTML = modalHeading;
            document.getElementById("modal-facts").innerHTML = modalFacts;

            // Print the speech list as last thing.
            printSpeechList.call(this);
        },

        /**
         * @param {string} speech - an html string of the speech
         * @param {string} obj - speech meta obj
         */
        printSpeech: function(speech, obj) {
            //hide the list
            VIEW.showModalSection("modal-speech-text");

            let speechElem = document.getElementById("modal-speech-text");
            //setting the speeches date
            speechElem.querySelector(".debate-context").innerHTML = obj.dok_datum;
            //speeches header
            speechElem.querySelector(".speech-header").innerHTML = obj.avsnittsrubrik;
            //body
            speechElem.querySelector("#speech-body").innerHTML = speech;
            //footer
            speechElem.querySelector("#speech-footer").innerHTML = `
            Läs hela debatten <a target="_blank" href="${obj.protokoll_url_www}">här</a>`;
            //button
            speechElem.querySelector("button").addEventListener("click", () => VIEW.showModalSection("modal-speech-list"));
        },

        showModalSection: function(section) {
            let listElem = document.getElementById("modal-speech-list").className = "hidden";
            let speechElem = document.getElementById("modal-speech-text").className = "hidden";

            document.getElementById(section).className = "visible";
        },

        /**
         * CAN BE MADE BETTER WITH FOREACH
         * First hides all the main sections except 
         ** @param {string} me
         */
        hideAllButMe: function(me) {
            let sections = ["loading-section", "toplist-section", "gender-chart-section", "party-chart-section", "about-section"];
            for (let i in sections) {
                document.getElementById(sections[i]).className = 'hidden';
            }

            document.getElementById(me).className = 'visible';
        },

        /**
         * EVENT LISTENERS FOR NON-DYNAMIC ELEMENTS
         * 1) first call picks upp mp-array and makes 300 ajax calls and creates
         * a live object.
         * 2) second call is a dev bypass that cuts directly to sorting using
         * a readymade array of objects.
         */
        init: (function() {
            // 1)
            // document.addEventListener("DOMContentLoaded", CONTROLLER.init);
            // 2
            document.addEventListener('DOMContentLoaded', function() {
                VIEW.hideAllButMe('toplist-section');
                CONTROLLER.storeArray(testMPs, 'all');
            });

            /**
             * event listeners for my menu items, since nothing on the page is a hyperlink, just JS.
             * Sends all of the nav-element to a controller function which then decides which one was clicked via 'this'.
             */
            document.querySelectorAll('.launch-nav-event').forEach(function(element) {
                element.addEventListener('click', CONTROLLER.navClick);
            }, this);

            /**
             * Same concept with my listeners for party filtering, except I toggle a class and lets the controller function check
             * which ones are 'active', ie selected.
             */
            const partyBtns = document.querySelectorAll('.partyBtn');
            partyBtns.forEach(function(element) {
                element.addEventListener('click', function() {
                    this.classList.toggle('activeParty');
                    CONTROLLER.getPartySelection(partyBtns);
                });
            }, this);
        })()
    };
})();