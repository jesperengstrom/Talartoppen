(function() {
    document.addEventListener("DOMContentLoaded", start);
    document.getElementById("getButton").addEventListener("click", getAllMPs);

})();

function start() {

}

function getAllMPs() {
    fetch("http://data.riksdagen.se/personlista/?iid=&fnamn=&enamn=&f_ar=&kn=&parti=&valkrets=&rdlstatus=&org=&utformat=json&termlista=")
        .then(response => response.json())
        .then(data => makeMPObject(data));
}

//making allmp:s an array of objects. MUST NOT BE GLOBAL
let allMPs = [];

function makeMPObject(MPs) {
    let personlista = MPs.personlista.person;

    //console.log(personlista);
    for (let i in personlista) {
        allMPs.push({
            id: personlista[i].intressent_id,
            fornamn: personlista[i].tilltalsnamn,
            efternamn: personlista[i].efternamn,
            parti: "(" + personlista[i].parti + ")"
        });
    }
    console.log(allMPs);
    calcDebateChamp(allMPs);
}

function calcDebateChamp(allMPs) {
    let fromDate = oneMonthBack();
    for (let i = 0; i < allMPs.length; i++) {
        fetch(`http://data.riksdagen.se/anforandelista/?rm=2016%2F17&anftyp=Nej&d=${fromDate}&ts=&parti=&iid=${allMPs[i].id}&sz=200&utformat=json`)
            .then(response => response.json())
            .then(data => print(data, i));
    }
}

function print(data, index) {
    allMPs[index].anforande = data.anforandelista["@antal"];
    console.log(allMPs[index]);
}

function oneMonthBack() {
    let date = new Date();
    return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
}



//making allmp:s an object literal of objects
// function makeMPObject(MPs) {
//     let personlista = MPs.personlista.person;
//     let allMPs = {}
//     console.log(personlista);
//     for (let i in personlista) {
//         allMPs[personlista[i].intressent_id] = {
//             id: personlista[i].intressent_id,
//             fornamn: personlista[i].tilltalsnamn,
//             efternamn: personlista[i].efternamn,
//             parti: personlista[i].parti
//         };
//     }
//     console.log(allMPs);
// }

/* function callRiksdagen() {
    fetch("http://data.riksdagen.se/anforandelista/?rm=2016%2F17&anftyp=Nej&d=2017-01-01&ts=&parti=&iid=0273506284025&sz=2000&utformat=json")
        .then(response => response.json())
        .then(data => display(data));
}

function display(data) {
    console.log(data);
    let number = data.anforandelista["@antal"];
    let name = data.anforandelista.anforande[0].talare;
    document.getElementById("displayP").innerText = `${name}: ${number}`;

}*/