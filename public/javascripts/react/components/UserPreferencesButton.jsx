/** @jsx React.DOM */

var UserPreferencesButton = React.createClass({
    _onClick: function (event) {
        PreferencesStore.loadUserPreferences(this.props.userName);
    },
    render: function () {
        return (
            <button onClick={this._onClick} className="btn btn-primary btn-small">Edit user preferences</button>
        );
    }
});