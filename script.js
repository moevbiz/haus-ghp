let colors=[
    'green',
    'blue',
    'red',
    'purple',
    'yellow',
    'orange',
    'grey',
    'brown',
]

let number;

let getNumber = function(target) {
    console.log(target.getAttribute('fill'));
    if (target.getAttribute('fill') == null || number == undefined) {
        number = Math.floor(Math.random()*colors.length);
    } else if (number == colors.length) {
        number = 0;
    } else {
        number++;
    }
    return number;
}

document.getElementById('house').addEventListener('click', function(e) {
    console.log(e.target);
    e.target.setAttribute('fill', colors[getNumber(e.target)]);
})